-- =============================================================================
-- KJORA — ADMIN-01.1 — Recherche, filtres et compteur gratuit/payant
-- =============================================================================
-- MIGRATION ADDITIVE. Ne modifie ni ne supprime aucune table, colonne, policy
-- existante. Remplace uniquement trois fonctions déjà introduites par ADMIN-01
-- (20260918120000_admin_01_platform_admin.sql), pour :
--
--   1. ajouter recherche + filtres aux listes Organizations et Abonnements,
--      sans jamais charger l'intégralité des lignes côté navigateur — le
--      filtrage reste entièrement côté RPC, comme la pagination déjà en place ;
--   2. ajouter au compteur de vue d'ensemble une ventilation gratuit/payant qui
--      ne compte QUE des abonnements RÉELLEMENT ENREGISTRÉS dans
--      `organization_subscriptions` — jamais le forfait effectif
--      (`organization_plans`), qui peut diverger de la facturation réelle (voir
--      point 3 plus bas). Une Organization sans ligne `organization_subscriptions`
--      n'est classée ni gratuite ni payante : elle est comptée séparément
--      ("sans abonnement enregistré"), jamais fondue dans l'une des deux cases ;
--   3. exposer une incohérence forfait/facturation quand elle existe RÉELLEMENT
--      (constat de l'audit ADMIN-01.1 sur KJORA Dev : une Organization a
--      `organization_plans.plan = 'essentiel'` — payant — alors que sa ligne
--      `organization_subscriptions` dit `plan = 'decouverte'` — gratuit). La
--      console ne corrige rien : elle signale seulement, honnêtement, et compte
--      toujours cette Organization comme abonnement GRATUIT enregistré, jamais
--      payant — c'est la seule ligne de facturation qui existe réellement.
--
-- NON APPLIQUÉE au Supabase KJORA à ce stade.
--
-- Sécurité : chaque fonction continue d'appeler assert_platform_admin() EN
-- PREMIER. Aucun filtre n'utilise de SQL dynamique (pas de `execute format`) :
-- les paramètres sont comparés directement dans la requête, donc aucune
-- injection n'est possible par construction. Le total renvoyé (`total_count`)
-- est TOUJOURS calculé sur le même WHERE que la page, pour ne jamais reproduire
-- le bug corrigé en ADMIN-01 (offset au-delà de la dernière ligne renvoyant un
-- total faussé) — y compris lorsqu'un filtre réduit le nombre de résultats.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Compteurs — abonnements réellement enregistrés + incohérences
-- ---------------------------------------------------------------------------
-- Même signature, même type de retour (jsonb) : remplacement pur, aucune
-- fonction à supprimer au préalable.
--
-- « Payant » reprend exactement la règle déjà utilisée côté application
-- (src/core/billing/model.ts : `plan !== "decouverte"`), appliquée ici à
-- `organization_subscriptions.plan` — jamais à `organization_plans.plan`
-- (le forfait effectif), qui n'est pas une preuve de facturation réelle.

create or replace function public.admin_platform_counters()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.assert_platform_admin();

  select jsonb_build_object(
    'organizations_total',     (select count(*) from public.organizations),
    'organizations_active',    (select count(*) from public.organizations where status = 'active'),
    'organizations_suspended', (select count(*) from public.organizations where status = 'suspended'),

    -- Abonnements RÉELLEMENT enregistrés uniquement (organization_subscriptions).
    'subscriptions_free', (select count(*) from public.organization_subscriptions where plan = 'decouverte'),
    'subscriptions_paid', (select count(*) from public.organization_subscriptions where plan <> 'decouverte'),

    -- Ni gratuite ni payante : aucune ligne de facturation n'existe pour elle.
    'organizations_without_subscription', (
      select count(*) from public.organizations o
      where not exists (
        select 1 from public.organization_subscriptions s where s.organization_id = o.id
      )
    ),

    -- Incohérence RÉELLEMENT mesurée : une Organization a une ligne
    -- organization_subscriptions ET son classement gratuit/payant n'y
    -- correspond pas à celui de son forfait effectif (organization_plans).
    -- Ne compare jamais les Organizations sans abonnement enregistré : sans
    -- ligne de facturation, il n'y a rien à comparer, donc rien à signaler ici.
    'plan_billing_mismatches', (
      select count(*)
      from public.organization_subscriptions s
      join public.organization_plans p on p.organization_id = s.organization_id
      where (p.plan = 'decouverte') <> (s.plan = 'decouverte')
    ),

    'subscriptions_by_status', coalesce((
      select jsonb_object_agg(status, n)
      from (
        select status, count(*) as n
        from public.organization_subscriptions
        group by status
      ) s
    ), '{}'::jsonb),
    'subscriptions_by_plan', coalesce((
      select jsonb_object_agg(plan, n)
      from (
        select plan, count(*) as n
        from public.organization_subscriptions
        group by plan
      ) p
    ), '{}'::jsonb),
    'generated_at', now()
  )
  into result;

  return result;
end;
$$;

revoke all on function public.admin_platform_counters() from public, anon;
grant execute on function public.admin_platform_counters() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Organizations — recherche par nom + filtre statut
-- ---------------------------------------------------------------------------
-- La signature change (deux paramètres ajoutés) : la fonction ADMIN-01 à deux
-- paramètres est explicitement supprimée avant recréation, pour ne jamais
-- laisser deux versions surchargées coexister (l'une des deux deviendrait
-- injoignable depuis PostgREST, qui ne sait pas laquelle choisir).

drop function if exists public.admin_list_organizations(integer, integer);

create or replace function public.admin_list_organizations(
  page_limit    integer default 25,
  page_offset   integer default 0,
  search_term   text    default null,
  status_filter text    default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_limit  integer;
  safe_offset integer;
  safe_search text;
  safe_status text;
  total       bigint;
  page_rows   jsonb;
begin
  perform private.assert_platform_admin();

  safe_limit  := least(greatest(coalesce(page_limit, 25), 1), 100);
  safe_offset := greatest(coalesce(page_offset, 0), 0);
  -- Chaîne vide traitée comme absence de filtre, comme un champ de recherche
  -- vidé par l'utilisateur.
  safe_search := nullif(trim(coalesce(search_term, '')), '');
  safe_status := nullif(trim(coalesce(status_filter, '')), '');

  -- Total calculé sur le MÊME filtre que la page : reste correct même quand
  -- l'offset demandé dépasse la dernière ligne filtrée.
  select count(*) into total
  from public.organizations o
  left join public.organization_profiles p on p.organization_id = o.id
  where (safe_search is null or p.name ilike '%' || safe_search || '%')
    and (safe_status is null or o.status::text = safe_status);

  select coalesce(jsonb_agg(row_to_json(page)), '[]'::jsonb)
  into page_rows
  from (
    select
      o.id as organization_id,
      coalesce(p.name, '')::text as name,
      o.status::text as status,
      o.created_at,
      (select count(*) from public.memberships m
        where m.organization_id = o.id and m.status = 'active') as member_count,
      coalesce(s.plan, 'decouverte')::text as plan,
      coalesce(s.status, 'free')::text as billing_status
    from public.organizations o
    left join public.organization_profiles      p on p.organization_id = o.id
    left join public.organization_subscriptions s on s.organization_id = o.id
    where (safe_search is null or p.name ilike '%' || safe_search || '%')
      and (safe_status is null or o.status::text = safe_status)
    order by o.created_at desc, o.id
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

revoke all on function public.admin_list_organizations(integer, integer, text, text) from public, anon;
grant execute on function public.admin_list_organizations(integer, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Abonnements — recherche par Organization + filtres forfait/statut/devise
-- ---------------------------------------------------------------------------

drop function if exists public.admin_list_subscriptions(integer, integer);

create or replace function public.admin_list_subscriptions(
  page_limit       integer default 25,
  page_offset      integer default 0,
  search_term      text    default null,
  plan_filter      text    default null,
  status_filter    text    default null,
  currency_filter  text    default null
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

  select count(*) into total
  from public.organization_subscriptions s
  left join public.organization_profiles p on p.organization_id = s.organization_id
  where (safe_search is null or p.name ilike '%' || safe_search || '%')
    and (safe_plan is null or s.plan::text = safe_plan)
    and (safe_status is null or s.status::text = safe_status)
    and (safe_currency is null or s.currency::text = safe_currency);

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
      s.updated_at
    from public.organization_subscriptions s
    left join public.organization_profiles p on p.organization_id = s.organization_id
    where (safe_search is null or p.name ilike '%' || safe_search || '%')
      and (safe_plan is null or s.plan::text = safe_plan)
      and (safe_status is null or s.status::text = safe_status)
      and (safe_currency is null or s.currency::text = safe_currency)
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

revoke all on function public.admin_list_subscriptions(integer, integer, text, text, text, text) from public, anon;
grant execute on function public.admin_list_subscriptions(integer, integer, text, text, text, text) to authenticated;
