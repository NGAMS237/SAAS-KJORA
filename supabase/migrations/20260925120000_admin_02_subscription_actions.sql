begin;

-- =============================================================================
-- KJORA — ADMIN-02 — Actions contrôlées sur l'abonnement (platform_admin)
-- =============================================================================
-- Ce lot transforme /administration/abonnements/[organizationId] en console de
-- gestion du cycle de vie d'un abonnement, réservée à platform_admin.
--
-- Principe directeur : ADMIN-02 n'invente AUCUNE deuxième machine à états. Il
-- réutilise exactement le domaine ALIGN-03 (organization_subscriptions,
-- billing_events, billing_prices) déjà en place :
--   • statuts existants ('free','active','payment_failed','grace',
--     'billing_blocked','cancellation_scheduled','cancelled',
--     'reactivation_pending') — aucun nouveau statut "suspended" créé ;
--   • "Suspendre" réutilise 'billing_blocked', qui bloque déjà toute écriture
--     métier via private.reject_when_billing_blocked() (ALIGN-03 §8) ;
--   • "Résilier à la fin de période" réutilise exactement la logique de
--     public.cancel_subscription (statut, cancellation_effective_on) ;
--   • "Changer de forfait" réutilise le contrôle de quota de downgrade de
--     public.request_plan_change (private.plan_quota_limits / billing_usage) ;
--   • l'audit réutilise public.billing_events (déjà lu par admin_events_freshness
--     — ADMIN-01), avec de nouveaux event_type préfixés admin_*.
--
-- Différence avec les RPC ALIGN-03 existantes : celles-ci sont gardées par
-- private.has_capability(organization_id, 'billing.manage') — c'est le
-- PROPRIÉTAIRE de l'Organization qui agit sur SA facturation, en libre-service
-- (upgrade = simple intention avec devis, jamais d'activation immédiate).
-- Les RPC ci-dessous sont gardées par private.assert_platform_admin() — c'est
-- la PLATEFORME qui corrige/administre l'état d'abonnement, avec effet
-- immédiat sur le champ `plan`/`status` (aucune donnée de paiement n'est créée
-- ou modifiée, aucun montant n'est facturé, aucun fournisseur n'est appelé).
--
-- Aucune suppression physique. "Archiver" masque de la liste active sans
-- jamais supprimer la ligne, son historique, ni ses billing_events.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colonnes additives — archivage (hygiène de console, jamais une suppression)
-- ---------------------------------------------------------------------------

alter table public.organization_subscriptions
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users (id);

comment on column public.organization_subscriptions.archived_at is
  'ADMIN-02 : masque la ligne des listes actives sans la supprimer. NULL = actif.';
comment on column public.organization_subscriptions.archived_by is
  'ADMIN-02 : platform_admin ayant archivé — jamais rempli automatiquement.';

create index if not exists organization_subscriptions_archived_idx
  on public.organization_subscriptions (archived_at)
  where archived_at is not null;

-- ---------------------------------------------------------------------------
-- 2. Détail d'un abonnement — lecture, aucune donnée fournisseur sensible
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_subscription(target_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sub public.organization_subscriptions;
  org_name text;
  recent_events jsonb;
begin
  perform private.assert_platform_admin();

  select * into sub from public.organization_subscriptions
   where organization_id = target_organization_id;

  if sub.organization_id is null then
    return jsonb_build_object('found', false);
  end if;

  select coalesce(p.name, '') into org_name
    from public.organization_profiles p
   where p.organization_id = target_organization_id;

  -- Historique d'audit : les 25 événements les plus récents. Aucun secret
  -- fournisseur, aucun token, aucun payload webhook brut n'est exposé ici —
  -- seuls event_type/from_status/to_status/payload applicatif/acteur/date.
  select coalesce(jsonb_agg(row_to_json(ev) order by ev.created_at desc), '[]'::jsonb)
    into recent_events
    from (
      select event_type, from_status, to_status, payload, actor_user_id, created_at
        from public.billing_events
       where organization_id = target_organization_id
       order by created_at desc
       limit 25
    ) ev;

  return jsonb_build_object(
    'found', true,
    'organizationId', sub.organization_id,
    'organizationName', org_name,
    'status', sub.status,
    'plan', sub.plan,
    'billingCycle', sub.billing_cycle,
    'currency', sub.currency,
    'currentPeriodStart', sub.current_period_start,
    'currentPeriodEnd', sub.current_period_end,
    'renewalDate', sub.renewal_date,
    'graceEndsOn', sub.grace_ends_on,
    'blockedAt', sub.blocked_at,
    'cancellationRequestedAt', sub.cancellation_requested_at,
    'cancellationEffectiveOn', sub.cancellation_effective_on,
    'scheduledPlan', sub.scheduled_plan,
    'scheduledCycle', sub.scheduled_cycle,
    'scheduledEffectiveOn', sub.scheduled_effective_on,
    'archivedAt', sub.archived_at,
    'archivedBy', sub.archived_by,
    'updatedAt', sub.updated_at,
    'recentEvents', recent_events
  );
end;
$$;

revoke all on function public.admin_get_subscription(uuid) from public, anon;
grant execute on function public.admin_get_subscription(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Changement de forfait — valeurs canoniques uniquement, effet immédiat
-- ---------------------------------------------------------------------------
-- Le client ne fournit jamais de prix, devise ou fournisseur : seuls `plan`
-- (slug canonique) et `cycle` sont acceptés, revalidés côté serveur. Le
-- downgrade réutilise exactement le contrôle de quota d'ALIGN-03 : aucune
-- donnée n'est jamais supprimée pour "faire passer" un downgrade — il est
-- simplement refusé, proprement, avec la liste des quotas en cause.

create or replace function public.admin_change_subscription_plan(
  target_organization_id uuid,
  target_plan  text,
  target_cycle text,
  reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub public.organization_subscriptions;
  usg record;
  lim record;
  blockers jsonb := '[]'::jsonb;
  rank_from int;
  rank_to int;
begin
  perform private.assert_platform_admin();

  if target_plan not in ('decouverte','essentiel','avance','patrimoine','sur_mesure')
     or target_cycle not in ('monthly','annual') then
    return jsonb_build_object('outcome','invalid_plan');
  end if;

  select * into sub from public.organization_subscriptions
   where organization_id = target_organization_id for update;

  if sub.organization_id is null then
    -- Une Organization sans ligne de facturation est créée avec les valeurs
    -- par défaut existantes (mêmes valeurs que request_plan_change).
    insert into public.organization_subscriptions (organization_id)
    values (target_organization_id)
    returning * into sub;
  end if;

  rank_from := case sub.plan   when 'decouverte' then 0 when 'essentiel' then 1
                 when 'avance' then 2 when 'patrimoine' then 3 else 4 end;
  rank_to   := case target_plan when 'decouverte' then 0 when 'essentiel' then 1
                 when 'avance' then 2 when 'patrimoine' then 3 else 4 end;

  if rank_to = rank_from and target_cycle = sub.billing_cycle then
    return jsonb_build_object('outcome','unchanged');
  end if;

  -- Contrôle de quota systématique (upgrade ET downgrade) : une correction
  -- admin ne doit jamais placer une Organization au-dessus des limites de son
  -- nouveau forfait — même logique que le downgrade en libre-service.
  select * into usg from private.billing_usage(target_organization_id);
  select * into lim from private.plan_quota_limits(target_plan, null, null, null, null);

  if lim.max_properties is not null and usg.active_properties > lim.max_properties then
    blockers := blockers || jsonb_build_object('quota','properties',
      'libelle','Biens','actuel',usg.active_properties,'limite',lim.max_properties);
  end if;
  if lim.max_active_units is not null and usg.active_units > lim.max_active_units then
    blockers := blockers || jsonb_build_object('quota','active_units',
      'libelle','Logements actifs','actuel',usg.active_units,'limite',lim.max_active_units);
  end if;
  if lim.max_collaborators is not null and usg.collaborators > lim.max_collaborators then
    blockers := blockers || jsonb_build_object('quota','collaborators',
      'libelle','Collaborateurs','actuel',usg.collaborators,'limite',lim.max_collaborators);
  end if;
  if lim.max_organizations is not null and usg.organizations > lim.max_organizations then
    blockers := blockers || jsonb_build_object('quota','organizations',
      'libelle','Organisations','actuel',usg.organizations,'limite',lim.max_organizations);
  end if;

  if jsonb_array_length(blockers) > 0 then
    return jsonb_build_object('outcome','plan_change_refused','blockers',blockers);
  end if;

  update public.organization_subscriptions
     set plan = target_plan,
         billing_cycle = target_cycle,
         -- Une correction admin directe annule toute intention en cours :
         -- elle ne doit jamais coexister avec un changement programmé stale.
         scheduled_plan = null, scheduled_cycle = null, scheduled_effective_on = null,
         pending_plan = null, pending_cycle = null, pending_amount_minor = null,
         pending_requested_at = null
   where organization_id = target_organization_id;

  insert into public.billing_events (organization_id, event_type, from_status, to_status,
                                     payload, actor_user_id)
  values (target_organization_id, 'admin_plan_changed', sub.status, sub.status,
          jsonb_build_object('adminAction', true, 'planBefore', sub.plan, 'planAfter', target_plan,
                             'cycleBefore', sub.billing_cycle, 'cycleAfter', target_cycle,
                             'reason', reason),
          (select auth.uid()));

  return jsonb_build_object('outcome','plan_changed','plan',target_plan,'cycle',target_cycle);
end;
$$;

revoke all on function public.admin_change_subscription_plan(uuid, text, text, text) from public, anon;
grant execute on function public.admin_change_subscription_plan(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Suspendre / Réactiver — réutilise 'billing_blocked' (ALIGN-03 §8)
-- ---------------------------------------------------------------------------
-- 'billing_blocked' bloque déjà toute écriture métier de l'Organization via
-- private.reject_when_billing_blocked(), quel que soit ce qui a déclenché ce
-- statut (échec de paiement OU décision admin). Aucun nouveau mécanisme de
-- blocage n'est créé : ADMIN-02 pose le même statut que la voie de paiement.

create or replace function public.admin_suspend_subscription(
  target_organization_id uuid,
  reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare sub public.organization_subscriptions;
begin
  perform private.assert_platform_admin();

  select * into sub from public.organization_subscriptions
   where organization_id = target_organization_id for update;

  if sub.organization_id is null then
    return jsonb_build_object('outcome','not_found');
  end if;
  if sub.status = 'billing_blocked' then
    return jsonb_build_object('outcome','already_suspended');
  end if;

  update public.organization_subscriptions
     set status = 'billing_blocked', blocked_at = now()
   where organization_id = target_organization_id;

  insert into public.billing_events (organization_id, event_type, from_status, to_status,
                                     payload, actor_user_id)
  values (target_organization_id, 'admin_subscription_suspended', sub.status, 'billing_blocked',
          jsonb_build_object('adminAction', true, 'reason', reason), (select auth.uid()));

  return jsonb_build_object('outcome','suspended');
end;
$$;

revoke all on function public.admin_suspend_subscription(uuid, text) from public, anon;
grant execute on function public.admin_suspend_subscription(uuid, text) to authenticated;

create or replace function public.admin_reactivate_subscription(
  target_organization_id uuid,
  reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare sub public.organization_subscriptions;
begin
  perform private.assert_platform_admin();

  select * into sub from public.organization_subscriptions
   where organization_id = target_organization_id for update;

  if sub.organization_id is null or sub.status <> 'billing_blocked' then
    return jsonb_build_object('outcome','not_suspended',
      'status', coalesce(sub.status, 'free'));
  end if;

  -- Réactivation admin = correction immédiate, distincte de
  -- request_reactivation (libre-service, qui attend un paiement provider non
  -- encore branché et reste en 'reactivation_pending'). Aucun mois suspendu
  -- n'est facturé rétroactivement, comme pour la voie libre-service.
  update public.organization_subscriptions
     set status = 'active', blocked_at = null,
         grace_started_on = null, grace_ends_on = null, last_failure_on = null
   where organization_id = target_organization_id;

  insert into public.billing_events (organization_id, event_type, from_status, to_status,
                                     payload, actor_user_id)
  values (target_organization_id, 'admin_subscription_reactivated', sub.status, 'active',
          jsonb_build_object('adminAction', true, 'reason', reason, 'retroactiveCharge', false),
          (select auth.uid()));

  return jsonb_build_object('outcome','reactivated');
end;
$$;

revoke all on function public.admin_reactivate_subscription(uuid, text) from public, anon;
grant execute on function public.admin_reactivate_subscription(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Résiliation programmée / annulation — réutilise cancel_subscription
-- ---------------------------------------------------------------------------

create or replace function public.admin_schedule_subscription_cancellation(
  target_organization_id uuid,
  reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub public.organization_subscriptions;
  effective date;
begin
  perform private.assert_platform_admin();

  select * into sub from public.organization_subscriptions
   where organization_id = target_organization_id for update;

  if sub.organization_id is null or sub.status = 'free' then
    return jsonb_build_object('outcome','nothing_to_cancel');
  end if;
  if sub.status in ('cancelled','cancellation_scheduled') then
    return jsonb_build_object('outcome','already_cancelled',
      'effectiveOn', sub.cancellation_effective_on);
  end if;

  -- Pas d'arrêt brutal : accès conservé jusqu'à la fin de la période payée
  -- déjà connue, exactement comme public.cancel_subscription. Aucun
  -- remboursement automatique.
  effective := coalesce(sub.current_period_end, current_date);

  update public.organization_subscriptions
     set status = 'cancellation_scheduled',
         cancellation_requested_at = now(),
         cancellation_effective_on = effective
   where organization_id = target_organization_id;

  insert into public.billing_events (organization_id, event_type, from_status, to_status,
                                     payload, actor_user_id)
  values (target_organization_id, 'admin_subscription_cancellation_scheduled', sub.status,
          'cancellation_scheduled',
          jsonb_build_object('adminAction', true, 'effectiveOn', effective, 'reason', reason),
          (select auth.uid()));

  return jsonb_build_object('outcome','cancellation_scheduled','effectiveOn',effective);
end;
$$;

revoke all on function public.admin_schedule_subscription_cancellation(uuid, text) from public, anon;
grant execute on function public.admin_schedule_subscription_cancellation(uuid, text) to authenticated;

create or replace function public.admin_revoke_subscription_cancellation(
  target_organization_id uuid,
  reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare sub public.organization_subscriptions;
begin
  perform private.assert_platform_admin();

  select * into sub from public.organization_subscriptions
   where organization_id = target_organization_id for update;

  if sub.organization_id is null or sub.status <> 'cancellation_scheduled' then
    return jsonb_build_object('outcome','not_scheduled');
  end if;

  update public.organization_subscriptions
     set status = 'active',
         cancellation_requested_at = null,
         cancellation_effective_on = null
   where organization_id = target_organization_id;

  insert into public.billing_events (organization_id, event_type, from_status, to_status,
                                     payload, actor_user_id)
  values (target_organization_id, 'admin_subscription_cancellation_revoked', sub.status, 'active',
          jsonb_build_object('adminAction', true, 'reason', reason), (select auth.uid()));

  return jsonb_build_object('outcome','cancellation_revoked');
end;
$$;

revoke all on function public.admin_revoke_subscription_cancellation(uuid, text) from public, anon;
grant execute on function public.admin_revoke_subscription_cancellation(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Archivage — hygiène de console, jamais une suppression
-- ---------------------------------------------------------------------------
-- Refusé sur un abonnement 'active' : archiver un abonnement encore vivant et
-- non résilié le ferait disparaître de la liste active tout en continuant à
-- produire des effets métier, ce qui serait trompeur pour la console.

create or replace function public.admin_archive_subscription(
  target_organization_id uuid,
  reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare sub public.organization_subscriptions;
begin
  perform private.assert_platform_admin();

  select * into sub from public.organization_subscriptions
   where organization_id = target_organization_id for update;

  if sub.organization_id is null then
    return jsonb_build_object('outcome','not_found');
  end if;
  if sub.archived_at is not null then
    return jsonb_build_object('outcome','already_archived');
  end if;
  if sub.status = 'active' then
    return jsonb_build_object('outcome','archive_refused',
      'message','Résiliez ou suspendez l''abonnement avant de l''archiver.');
  end if;

  update public.organization_subscriptions
     set archived_at = now(), archived_by = (select auth.uid())
   where organization_id = target_organization_id;

  insert into public.billing_events (organization_id, event_type, from_status, to_status,
                                     payload, actor_user_id)
  values (target_organization_id, 'admin_subscription_archived', sub.status, sub.status,
          jsonb_build_object('adminAction', true, 'reason', reason), (select auth.uid()));

  return jsonb_build_object('outcome','archived');
end;
$$;

revoke all on function public.admin_archive_subscription(uuid, text) from public, anon;
grant execute on function public.admin_archive_subscription(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Liste des abonnements — ajout du filtre d'archivage (défaut : actifs)
-- ---------------------------------------------------------------------------

drop function if exists public.admin_list_subscriptions(integer, integer, text, text, text, text);

create or replace function public.admin_list_subscriptions(
  page_limit       integer default 25,
  page_offset      integer default 0,
  search_term      text    default null,
  plan_filter      text    default null,
  status_filter    text    default null,
  currency_filter  text    default null,
  archived_filter  text    default 'active'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_limit    integer;
  safe_offset   integer;
  safe_search   text;
  safe_plan     text;
  safe_status   text;
  safe_currency text;
  safe_archived text;
  total         bigint;
  page_rows     jsonb;
begin
  perform private.assert_platform_admin();

  safe_limit    := least(greatest(coalesce(page_limit, 25), 1), 100);
  safe_offset   := greatest(coalesce(page_offset, 0), 0);
  safe_search   := nullif(trim(coalesce(search_term, '')), '');
  safe_plan     := nullif(trim(coalesce(plan_filter, '')), '');
  safe_status   := nullif(trim(coalesce(status_filter, '')), '');
  safe_currency := nullif(trim(coalesce(currency_filter, '')), '');
  safe_archived := case
    when archived_filter in ('active','archived','all') then archived_filter
    else 'active'
  end;

  select count(*) into total
  from public.organization_subscriptions s
  left join public.organization_profiles p on p.organization_id = s.organization_id
  where (safe_search is null or p.name ilike '%' || safe_search || '%')
    and (safe_plan is null or s.plan::text = safe_plan)
    and (safe_status is null or s.status::text = safe_status)
    and (safe_currency is null or s.currency::text = safe_currency)
    and (
      safe_archived = 'all'
      or (safe_archived = 'active' and s.archived_at is null)
      or (safe_archived = 'archived' and s.archived_at is not null)
    );

  select coalesce(jsonb_agg(row_to_json(page)), '[]'::jsonb)
  into page_rows
  from (
    select
      s.organization_id,
      coalesce(p.name, '')::text as organization_name,
      s.status::text as status,
      s.plan::text as plan,
      s.billing_cycle::text as billing_cycle,
      s.currency::text as currency,
      s.current_period_end,
      s.renewal_date,
      s.grace_ends_on,
      (s.provider is not null) as has_provider,
      (s.archived_at is not null) as archived,
      s.updated_at
    from public.organization_subscriptions s
    left join public.organization_profiles p on p.organization_id = s.organization_id
    where (safe_search is null or p.name ilike '%' || safe_search || '%')
      and (safe_plan is null or s.plan::text = safe_plan)
      and (safe_status is null or s.status::text = safe_status)
      and (safe_currency is null or s.currency::text = safe_currency)
      and (
        safe_archived = 'all'
        or (safe_archived = 'active' and s.archived_at is null)
        or (safe_archived = 'archived' and s.archived_at is not null)
      )
    order by s.updated_at desc, s.organization_id
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

revoke all on function public.admin_list_subscriptions(integer, integer, text, text, text, text, text) from public, anon;
grant execute on function public.admin_list_subscriptions(integer, integer, text, text, text, text, text) to authenticated;

commit;
