begin;

-- =============================================================================
-- KJORA — FINANCE-ADMIN-01 — Modèle de lecture financière (lecture seule)
-- =============================================================================
-- MIGRATION ADDITIVE. Aucune table, colonne, policy ou fonction existante
-- n'est modifiée ni supprimée. Aucune écriture n'est jamais effectuée par les
-- deux fonctions ci-dessous : uniquement des lectures agrégées, exposées à
-- `platform_admin` par deux RPC `security definer`.
--
-- Aucune deuxième machine de facturation : ce lot ne crée ni table de prix,
-- ni table d'abonnement, ni table d'événement. Il lit exclusivement :
--   • public.organizations / organization_profiles   (identité)
--   • public.organization_subscriptions (ALIGN-03)    → facturation RÉELLEMENT enregistrée
--   • public.billing_prices (ALIGN-03)                → SEULE source de prix catalogue fiable
--   • public.commercial_interventions (ADMIN-BILLING-OPS-01) → gestes commerciaux + paiements hors ligne
--   • public.billing_events (ALIGN-03)                → trace d'événements déjà utilisée par admin_recent_events
--
-- Principes non négociables appliqués ici (mandat FINANCE-ADMIN-01) :
--   1. CAD et XAF ne sont JAMAIS additionnés — chaque agrégat monétaire est
--      retourné par devise, jamais fusionné.
--   2. « Revenu attendu » (théorique, dérivé de billing_prices + l'état
--      COURANT des abonnements, indépendant de la période choisie) et
--      « revenu encaissé » (hors ligne, borné à la période choisie) restent
--      deux blocs distincts du jsonb retourné, jamais mélangés dans un même
--      total.
--   3. `organization_plans` n'est JAMAIS utilisé seul comme preuve de
--      facturation : uniquement organization_subscriptions + billing_prices.
--   4. Un abonnement au forfait `sur_mesure` est structurellement exclu du
--      calcul de revenu attendu : `billing_prices.amount_minor` vaut NULL
--      pour ce forfait (ALIGN-03, aucune exception ajoutée ici), et la
--      jointure sur un prix non nul l'exclut automatiquement.
--   5. Une intervention commerciale « offerte » (complimentary / promotion /
--      partnership / support_adjustment) n'est JAMAIS comptée comme un
--      encaissement : seul `intervention_type = 'offline_payment'` alimente
--      le bloc « encaissé hors ligne ».
--   6. Stripe et Mobile Money : aucun appel réseau, aucune table dédiée —
--      toujours renvoyés comme NON CONNECTÉ.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Fonction interne — bornes de la période, validées par une liste fermée
-- ---------------------------------------------------------------------------
-- Jamais de SQL dynamique : la période est une énumération fermée résolue en
-- PL/pgSQL vers deux bornes `timestamptz`, utilisées ensuite comme paramètres
-- liés ordinaires dans les requêtes. Une valeur hors liste est refusée
-- (exception), jamais silencieusement ramenée à une valeur par défaut : un
-- appelant qui se trompe de valeur doit le savoir, pas obtenir des chiffres
-- pour une période différente de celle demandée.

create or replace function private.finance_period_bounds(period_filter text)
returns table (period_start timestamptz, period_end timestamptz, period_key text)
language plpgsql
stable
set search_path = ''
as $$
begin
  case period_filter
    when 'last_30_days' then
      period_start := date_trunc('day', now()) - interval '30 days';
    when 'last_90_days' then
      period_start := date_trunc('day', now()) - interval '90 days';
    when 'current_year' then
      period_start := date_trunc('year', now());
    when 'all_time' then
      period_start := null;
    else
      raise exception 'FINANCE-ADMIN-01: invalid period_filter %', period_filter
        using errcode = '22023'; -- invalid_parameter_value
  end case;

  period_end := now();
  period_key := period_filter;
  return next;
end;
$$;

revoke all on function private.finance_period_bounds(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. admin_finance_summary(period_filter) — compteurs + revenus + connecteurs
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
    where s.status in ('active', 'payment_failed', 'grace', 'billing_blocked', 'cancellation_scheduled')
    group by s.currency
  ) grouped;

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
      'basis', 'current_state_not_period_scoped'
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
-- 2. admin_finance_recent_events(limit, offset, period_filter) — tableau F
-- ---------------------------------------------------------------------------
-- Union de deux sources déjà existantes, jamais une nouvelle table d'audit :
--   • public.billing_events        → événements de cycle de vie de facturation
--     (aucun montant : la table ne porte pas de colonne currency/amount, et
--     son `payload` jsonb n'est JAMAIS lu ici — seules des colonnes typées le
--     sont, conformément à l'interdiction de restituer un contenu de payload
--     brut).
--   • public.commercial_interventions → gestes commerciaux, dont les
--     paiements hors ligne (seul cas où currency/amount sont renvoyés).
--
-- Jamais exposés : provider_event_id, actor_user_id, payload, admin_note,
-- manual_reference, idempotency_key, revoke_reason — aucune de ces colonnes
-- n'apparaît dans les deux `select` ci-dessous.

create or replace function public.admin_finance_recent_events(
  page_limit    integer default 25,
  page_offset   integer default 0,
  period_filter text    default 'last_30_days'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bounds      record;
  safe_limit  integer;
  safe_offset integer;
  total       bigint;
  page_rows   jsonb;
begin
  perform private.assert_platform_admin();

  select * into bounds from private.finance_period_bounds(period_filter);

  safe_limit  := least(greatest(coalesce(page_limit, 25), 1), 100);
  safe_offset := greatest(coalesce(page_offset, 0), 0);

  with events as (
    select
      e.id                as event_id,
      e.organization_id   as organization_id,
      e.event_type::text  as category,
      coalesce(e.to_status::text, e.from_status::text, '') as status,
      null::text          as currency,
      null::bigint        as amount_minor,
      'subscription'::text as source,
      e.created_at        as occurred_at
    from public.billing_events e
    where (bounds.period_start is null or e.created_at >= bounds.period_start)
      and e.created_at <= bounds.period_end

    union all

    select
      ci.id,
      ci.organization_id,
      ci.intervention_type::text,
      ci.status::text,
      ci.currency,
      ci.amount_minor,
      case when ci.intervention_type = 'offline_payment' then 'offline_payment' else 'manual_intervention' end,
      ci.created_at
    from public.commercial_interventions ci
    where (bounds.period_start is null or ci.created_at >= bounds.period_start)
      and ci.created_at <= bounds.period_end
  )
  select count(*) into total from events;

  with events as (
    select
      e.id                as event_id,
      e.organization_id   as organization_id,
      e.event_type::text  as category,
      coalesce(e.to_status::text, e.from_status::text, '') as status,
      null::text          as currency,
      null::bigint        as amount_minor,
      'subscription'::text as source,
      e.created_at        as occurred_at
    from public.billing_events e
    where (bounds.period_start is null or e.created_at >= bounds.period_start)
      and e.created_at <= bounds.period_end

    union all

    select
      ci.id,
      ci.organization_id,
      ci.intervention_type::text,
      ci.status::text,
      ci.currency,
      ci.amount_minor,
      case when ci.intervention_type = 'offline_payment' then 'offline_payment' else 'manual_intervention' end,
      ci.created_at
    from public.commercial_interventions ci
    where (bounds.period_start is null or ci.created_at >= bounds.period_start)
      and ci.created_at <= bounds.period_end
  )
  select coalesce(jsonb_agg(row_to_json(page)), '[]'::jsonb)
  into page_rows
  from (
    select
      ev.event_id,
      ev.organization_id,
      coalesce(p.name, '')::text as organization_name,
      ev.category,
      ev.status,
      ev.currency,
      ev.amount_minor,
      ev.source,
      ev.occurred_at
    from events ev
    left join public.organization_profiles p on p.organization_id = ev.organization_id
    order by ev.occurred_at desc, ev.event_id
    limit safe_limit offset safe_offset
  ) page;

  return jsonb_build_object(
    'rows', page_rows,
    'total_count', total,
    'limit', safe_limit,
    'offset', safe_offset
  );
end;
$$;

revoke all on function public.admin_finance_recent_events(integer, integer, text) from public, anon;
grant execute on function public.admin_finance_recent_events(integer, integer, text) to authenticated;

commit;
