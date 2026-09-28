begin;

-- =============================================================================
-- KJORA — REVENUE-LAUNCH-01 — Sous-lot 01E — Extension Admin Finances
-- =============================================================================
-- Ce lot ajoute une SECONDE fonction de lecture, purement additive
-- (admin_finance_billing_extension), qui expose les chiffres nés de 01B/01C.
-- La page Admin Finances les affiche côte à côte, jamais fusionnés.
--
-- Une seule modification de FINANCE-ADMIN-01 (public.admin_finance_summary,
-- 20260927090000), décidée par le complément REVENUE-LAUNCH-01 et faite ICI
-- une seule fois (section 0) : le revenu mensuel attendu exclut désormais
-- les Organizations archivées, comptées à part
-- (`expected_revenue.excluded_archived_subscriptions`) — jamais perdues en
-- silence. Tous les autres agrégats de FINANCE-ADMIN-01 sont reproduits à
-- l'identique.
--
-- NON APPLIQUÉE à ce stade (ni Dev, ni Production) — même point d'arrêt que
-- tous les lots précédents de REVENUE-LAUNCH-01.
--
-- Aucune deuxième machine de facturation : lecture seule, aucune écriture.
-- Lit exclusivement des tables déjà existantes :
--   • public.billing_invoices        (REVENUE-01B — facturation manuelle Afrique)
--   • public.billing_reminder_log    (REVENUE-01C — idempotence des rappels)
--   • private.compute_due_billing_reminders(date) (REVENUE-01C — calcul pur)
--   • public.billing_payment_attempts (ALIGN-03 — tentatives de règlement)
--
-- Principes non négociables (identiques à FINANCE-ADMIN-01) :
--   1. CAD et XAF ne sont JAMAIS additionnés. La facturation manuelle
--      (REVENUE-01B) est structurellement XAF-only (contrainte applicative,
--      voir REVENUE-01B), donc ces agrégats ne porteront jamais de clé CAD
--      en pratique — mais restent renvoyés PAR DEVISE, jamais un total nu,
--      pour rester corrects si ce périmètre s'étend un jour.
--   2. « Factures dues / en retard » sont un état COURANT (comme le revenu
--      attendu de FINANCE-ADMIN-01), jamais borné par la période choisie.
--      « Paiements manuels confirmés » et « rappels envoyés » sont, eux,
--      bornés à la période choisie (comme le revenu encaissé).
--   3. « Rappels à envoyer » interroge le calcul pur (dry-run, aucune
--      écriture) à l'instant présent — jamais confondu avec les rappels déjà
--      journalisés dans billing_reminder_log.
--   4. « Paiements manuels confirmés » (REVENUE-01B, billing_invoices) reste
--      un compteur STRICTEMENT séparé de « paiements hors ligne enregistrés »
--      (ADMIN-BILLING-OPS-01, commercial_interventions) déjà exposé par
--      FINANCE-ADMIN-01 : deux domaines distincts, jamais fusionnés.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. FINANCE-ADMIN-01 — revenu attendu hors Organizations archivées
-- ---------------------------------------------------------------------------

create or replace function public.admin_finance_summary(
  period_filter text default 'last_30_days'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bounds          record;
  platform_counts jsonb;
  intervention_counts jsonb;
  offline_by_currency jsonb;
  expected_by_currency jsonb;
  archived_excluded_count int;
  subscriptions_by_plan jsonb;
  free_paid_breakdown jsonb;
  result jsonb;
begin
  perform private.assert_platform_admin();

  select * into bounds from private.finance_period_bounds(period_filter);

  -- Réutilise les compteurs déjà exposés par ADMIN-01.1 et ADMIN-BILLING-OPS-01
  -- au lieu d'en dupliquer la logique (organizations, abonnements enregistrés,
  -- incohérences forfait/facturation, interventions actives, gratuités,
  -- paiements hors ligne actifs).
  platform_counts := public.admin_platform_counters();
  intervention_counts := public.admin_commercial_intervention_counters();

  -- B. Répartition gratuit / payant / sans abonnement enregistré, pour le
  -- graphique léger n°2 — dérivée des mêmes compteurs, aucune requête de plus.
  free_paid_breakdown := jsonb_build_object(
    'free', platform_counts->'subscriptions_free',
    'paid', platform_counts->'subscriptions_paid',
    'without_subscription', platform_counts->'organizations_without_subscription'
  );
  subscriptions_by_plan := coalesce(platform_counts->'subscriptions_by_plan', '{}'::jsonb);

  -- C. Encaissé HORS LIGNE, séparé par devise, borné à la période choisie.
  -- Source unique et fiable : commercial_interventions.intervention_type =
  -- 'offline_payment'. Une intervention offerte (complimentary/promotion/
  -- partnership/support_adjustment) n'a structurellement ni currency ni
  -- amount_minor (contrainte commercial_interventions_non_offline_has_no_amount)
  -- et ne peut donc jamais apparaître ici.
  select coalesce(jsonb_object_agg(currency, total_minor), '{}'::jsonb)
  into offline_by_currency
  from (
    select ci.currency, sum(ci.amount_minor) as total_minor
    from public.commercial_interventions ci
    where ci.intervention_type = 'offline_payment'
      and (bounds.period_start is null or ci.created_at >= bounds.period_start)
      and ci.created_at <= bounds.period_end
    group by ci.currency
  ) grouped;

  -- D. Revenu MENSUEL ATTENDU, séparé par devise — état COURANT des
  -- abonnements réellement enregistrés (organization_subscriptions), jamais
  -- borné par la période choisie (c'est un régime théorique « si rien ne
  -- change », pas un montant réellement perçu sur l'intervalle). Uniquement
  -- des abonnements réellement facturés (exclut 'free' et 'cancelled') ;
  -- jointure sur billing_prices avec un prix non nul, qui exclut de fait tout
  -- `sur_mesure` (prix catalogue NULL — ALIGN-03) sans exception codée en dur
  -- ici. Un abonnement annuel est ramené au mensuel en divisant par 12 le
  -- prix catalogue annuel — jamais un prix inventé.
  select coalesce(jsonb_object_agg(currency, monthly_minor), '{}'::jsonb)
  into expected_by_currency
  from (
    select
      s.currency,
      sum(
        case s.billing_cycle
          when 'monthly' then bp.amount_minor
          when 'annual'  then round(bp.amount_minor / 12.0)
        end
      ) as monthly_minor
    from public.organization_subscriptions s
    join public.billing_prices bp
      on bp.plan = s.plan
     and bp.cycle = s.billing_cycle
     and bp.currency = s.currency
     and bp.amount_minor is not null
    join public.organizations o on o.id = s.organization_id
    where s.status in ('active', 'payment_failed', 'grace', 'billing_blocked', 'cancellation_scheduled')
      -- REVENUE-LAUNCH-01 : une Organization archivée n'est jamais un revenu
      -- futur normal. Elle n'est pas perdue en silence pour autant : elle est
      -- comptée à part (excluded_archived_subscriptions ci-dessous).
      and o.status <> 'archived'
    group by s.currency
  ) grouped;

  select count(*) into archived_excluded_count
  from public.organization_subscriptions s
  join public.organizations o on o.id = s.organization_id
  where s.status in ('active', 'payment_failed', 'grace', 'billing_blocked', 'cancellation_scheduled')
    and o.status = 'archived';

  result := jsonb_build_object(
    'period', jsonb_build_object(
      'key', bounds.period_key,
      'start', bounds.period_start,
      'end', bounds.period_end
    ),

    'commercial_counters', jsonb_build_object(
      'organizations_total', platform_counts->'organizations_total',
      'subscriptions_free', platform_counts->'subscriptions_free',
      'subscriptions_paid', platform_counts->'subscriptions_paid',
      'organizations_without_subscription', platform_counts->'organizations_without_subscription',
      'plan_billing_mismatches', platform_counts->'plan_billing_mismatches',
      'active_commercial_interventions', intervention_counts->'activeInterventions',
      'active_complimentary', intervention_counts->'complimentaryActive',
      'registered_offline_payments', intervention_counts->'offlinePaymentsActive'
    ),

    'charts', jsonb_build_object(
      'subscriptions_by_plan', subscriptions_by_plan,
      'free_paid_breakdown', free_paid_breakdown,
      'expected_revenue_by_currency', expected_by_currency
    ),

    'collected_revenue', jsonb_build_object(
      'offline_by_currency', offline_by_currency,
      -- NON DISPONIBLE tant qu'aucune ligne fiable ne représente
      -- explicitement un encaissement Stripe/Mobile Money (voir §G).
      'stripe_connected', false,
      'mobile_money_connected', false
    ),

    'expected_revenue', jsonb_build_object(
      'by_currency', expected_by_currency,
      'basis', 'current_state_not_period_scoped',
      'excluded_archived_subscriptions', archived_excluded_count
    ),

    'connectors', jsonb_build_object(
      'supabase_internal', jsonb_build_object('state', 'connected'),
      'stripe', jsonb_build_object('state', 'not_connected'),
      'mobile_money', jsonb_build_object('state', 'not_connected')
    ),

    'generated_at', now()
  );

  return result;
end;
$$;

revoke all on function public.admin_finance_summary(text) from public, anon;
grant execute on function public.admin_finance_summary(text) to authenticated;


-- ---------------------------------------------------------------------------
-- 1. admin_finance_billing_extension — facturation manuelle et rappels
-- ---------------------------------------------------------------------------

create or replace function public.admin_finance_billing_extension(
  period_filter text default 'last_30_days'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bounds                       record;
  invoices_due_by_currency     jsonb;
  invoices_overdue_by_currency jsonb;
  archived_open_by_currency    jsonb;
  manual_payments_count        int;
  manual_payments_by_currency  jsonb;
  reminders_sent_count         int;
  reminders_due_now_count      int;
  payment_failures_count       int;
begin
  perform private.assert_platform_admin();

  -- Réutilise les bornes de FINANCE-ADMIN-01 : même énumération fermée, même
  -- comportement (valeur hors liste refusée, jamais ramenée en silence).
  select * into bounds from private.finance_period_bounds(period_filter);

  -- A. Factures dues / en retard — état COURANT, jamais borné à la période.
  -- "Due" = statut 'open'. "En retard" = 'open' ET échéance (due_on, repli
  -- period_end pour une facture antérieure à REVENUE-01B) dépassée.
  -- Une facture ouverte d'une Organization ARCHIVÉE n'est pas un encours
  -- normal : elle est exclue de ces deux compteurs et comptée à part
  -- (archived_open_by_currency), jamais perdue en silence.
  select coalesce(jsonb_object_agg(currency, total), '{}'::jsonb) into invoices_due_by_currency
  from (
    select i.currency, count(*) as total
    from public.billing_invoices i
    join public.organizations o on o.id = i.organization_id
    where i.status = 'open' and o.status <> 'archived'
    group by i.currency
  ) grouped;

  select coalesce(jsonb_object_agg(currency, total), '{}'::jsonb) into invoices_overdue_by_currency
  from (
    select i.currency, count(*) as total
    from public.billing_invoices i
    join public.organizations o on o.id = i.organization_id
    where i.status = 'open' and o.status <> 'archived'
      and coalesce(i.due_on, i.period_end) < current_date
    group by i.currency
  ) grouped;

  select coalesce(jsonb_object_agg(currency, total), '{}'::jsonb) into archived_open_by_currency
  from (
    select i.currency, count(*) as total
    from public.billing_invoices i
    join public.organizations o on o.id = i.organization_id
    where i.status = 'open' and o.status = 'archived'
    group by i.currency
  ) grouped;

  -- B. Paiements manuels confirmés (REVENUE-01B) — bornés à la période,
  -- jamais confondus avec les interventions commerciales offline_payment.
  select count(*) into manual_payments_count
  from public.billing_invoices
  where manual_payment_confirmed_at is not null
    and (bounds.period_start is null or manual_payment_confirmed_at >= bounds.period_start)
    and manual_payment_confirmed_at <= bounds.period_end;

  select coalesce(jsonb_object_agg(currency, total_minor), '{}'::jsonb) into manual_payments_by_currency
  from (
    select currency, sum(amount_minor) as total_minor
    from public.billing_invoices
    where manual_payment_confirmed_at is not null
      and (bounds.period_start is null or manual_payment_confirmed_at >= bounds.period_start)
      and manual_payment_confirmed_at <= bounds.period_end
    group by currency
  ) grouped;

  -- C. Rappels envoyés (journalisés, REVENUE-01C) dans la période, et
  -- rappels à envoyer MAINTENANT (calcul pur, dry-run, aucune écriture).
  select count(*) into reminders_sent_count
  from public.billing_reminder_log
  where (bounds.period_start is null or computed_at >= bounds.period_start)
    and computed_at <= bounds.period_end;

  select count(*) into reminders_due_now_count
  from private.compute_due_billing_reminders(current_date);

  -- D. Échecs de paiement (ALIGN-03, billing_payment_attempts) dans la
  -- période. Restera à 0 tant qu'aucun fournisseur automatisé n'est activé
  -- (aucune tentative n'est créée sans provider réel) — c'est attendu, pas un
  -- bug : voir REVENUE-LAUNCH-01, décisions verrouillées.
  select count(*) into payment_failures_count
  from public.billing_payment_attempts
  where status = 'failed'
    and (bounds.period_start is null or coalesce(completed_at, scheduled_on::timestamptz) >= bounds.period_start)
    and coalesce(completed_at, scheduled_on::timestamptz) <= bounds.period_end;

  return jsonb_build_object(
    'period', jsonb_build_object('key', bounds.period_key, 'start', bounds.period_start, 'end', bounds.period_end),
    'manual_invoicing', jsonb_build_object(
      'due_by_currency', invoices_due_by_currency,
      'overdue_by_currency', invoices_overdue_by_currency,
      'archived_open_by_currency', archived_open_by_currency,
      'payments_confirmed_count', manual_payments_count,
      'payments_confirmed_by_currency', manual_payments_by_currency
    ),
    'reminders', jsonb_build_object(
      'sent_in_period', reminders_sent_count,
      'due_now', reminders_due_now_count
    ),
    'payment_failures_in_period', payment_failures_count,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.admin_finance_billing_extension(text) from public, anon;
grant execute on function public.admin_finance_billing_extension(text) to authenticated;

commit;
