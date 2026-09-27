begin;

-- =============================================================================
-- KJORA — REVENUE-LAUNCH-01 — Sous-lot 01E — Extension Admin Finances
-- =============================================================================
-- MIGRATION ADDITIVE. La RPC FINANCE-ADMIN-01 (public.admin_finance_summary,
-- 20260927090000) n'est NI modifiée NI remplacée : elle a été livrée comme un
-- lot fermé et testé, avant que REVENUE-01B (facturation manuelle Afrique) et
-- REVENUE-01C (rappels automatiques) n'existent. Plutôt que de rouvrir ce
-- fichier, ce lot ajoute une SECONDE fonction de lecture, purement additive,
-- qui expose les chiffres nés de 01B/01C. La page Admin Finances les affiche
-- côte à côte, jamais fusionnés dans les mêmes totaux.
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

  -- A. Factures dues / en retard — état COURANT, jamais borné à la période
  -- (comme le revenu attendu de FINANCE-ADMIN-01). "Due" = statut 'open'.
  -- "En retard" = 'open' ET la période de facturation est déjà terminée.
  select coalesce(jsonb_object_agg(currency, total), '{}'::jsonb) into invoices_due_by_currency
  from (
    select currency, count(*) as total
    from public.billing_invoices
    where status = 'open'
    group by currency
  ) grouped;

  select coalesce(jsonb_object_agg(currency, total), '{}'::jsonb) into invoices_overdue_by_currency
  from (
    select currency, count(*) as total
    from public.billing_invoices
    where status = 'open' and period_end < current_date
    group by currency
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
