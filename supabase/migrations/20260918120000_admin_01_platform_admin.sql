-- =============================================================================
-- KJORA — ADMIN-01 — Rôle platform_admin et console privée (lecture seule)
-- =============================================================================
-- MIGRATION ADDITIVE. Aucune table, colonne, policy ou fonction existante n'est
-- modifiée ni supprimée. Tout est nouveau et isolé.
--
-- NON APPLIQUÉE au Supabase KJORA à ce stade (consigne ADMIN-01).
--
-- Contexte : avant ce lot, `platform_admin` n'existait nulle part dans le code
-- ni en base — une seule mention, dans un commentaire de
-- src/core/routing/context-resolver.ts. Le modèle d'autorisation existant est
-- entièrement SCOPÉ PAR ORGANIZATION (memberships + role_capabilities +
-- private.has_capability). Il ne peut pas exprimer un accès transverse.
--
-- Ce lot introduit donc une autorité SÉPARÉE, volontairement disjointe du
-- modèle par Organization :
--   • être platform_admin ne donne AUCUN droit dans une Organization ;
--   • être Organization Owner ne donne AUCUN droit plateforme ;
--   • les deux ne se recouvrent jamais.
--
-- Principe de moindre privilège : la console est en LECTURE SEULE. Aucune RPC
-- d'écriture n'est créée. L'octroi du rôle lui-même ne peut pas se faire depuis
-- l'application — il exige le service role (voir §6).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table des administrateurs plateforme
-- ---------------------------------------------------------------------------

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  -- Qui a accordé le rôle. Null si octroyé hors application (service role).
  granted_by uuid references auth.users (id),
  -- Justification opérationnelle. Jamais de donnée personnelle ici.
  note       text check (note is null or char_length(note) <= 500)
);

comment on table public.platform_admins is
  'ADMIN-01 — Administrateurs plateforme KJORA. Autorité transverse, disjointe '
  'du modèle par Organization. Lecture seule côté application ; octroi réservé '
  'au service role.';

-- ---------------------------------------------------------------------------
-- 2. Prédicat d'autorisation
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER : la fonction doit lire platform_admins alors que la RLS de
-- cette table interdit la lecture aux non-admins. Sans cela, le prédicat
-- renverrait toujours faux pour l'utilisateur qu'il doit justement autoriser.
--
-- `set search_path = ''` : tous les objets sont qualifiés. Empêche le
-- détournement par un schéma temporaire contrôlé par l'appelant.

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = (select auth.uid())
  );
$$;

comment on function private.is_platform_admin() is
  'ADMIN-01 — Vrai si l''utilisateur courant est administrateur plateforme. '
  'Ne confère aucun droit dans une Organization.';

revoke all on function private.is_platform_admin() from public, anon;
grant execute on function private.is_platform_admin() to authenticated;

-- Garde commune : lève une exception plutôt que de renvoyer un jeu vide.
-- Une RPC qui renverrait silencieusement zéro ligne serait indistinguable
-- d'une plateforme vide — l'appelant doit savoir qu'il a été refusé.
create or replace function private.assert_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_platform_admin()) then
    raise exception 'ADMIN-01: platform admin required'
      using errcode = '42501'; -- insufficient_privilege
  end if;
end;
$$;

revoke all on function private.assert_platform_admin() from public, anon;
grant execute on function private.assert_platform_admin() to authenticated;

-- Exposition publique du prédicat, pour la garde applicative.
-- Le schéma `private` n'est pas accessible via PostgREST : sans ce relais,
-- l'application ne pourrait pas interroger son propre statut.
-- Ne renvoie QUE le statut de l'appelant — aucun paramètre, donc aucun moyen
-- de sonder le statut d'un autre utilisateur.
create or replace function public.is_platform_admin_self()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin();
$$;

comment on function public.is_platform_admin_self() is
  'ADMIN-01 — Statut administrateur plateforme de l''appelant uniquement.';

revoke all on function public.is_platform_admin_self() from public, anon;
grant execute on function public.is_platform_admin_self() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS sur platform_admins — AUCUN accès direct, ni lecture ni écriture
-- ---------------------------------------------------------------------------
-- La console ne présente jamais la liste des administrateurs : aucune RPC ne
-- la renvoie. Le seul besoin réel est que CHAQUE utilisateur puisse connaître
-- SON PROPRE statut, ce que sert déjà public.is_platform_admin_self() (§2).
--
-- private.is_platform_admin() et les RPC de la console sont SECURITY DEFINER :
-- elles s'exécutent avec les privilèges du propriétaire de la fonction (le
-- rôle qui a appliqué la migration), qui n'est pas soumis à la RLS de la
-- table qu'il possède. Une policy SELECT sur platform_admins n'est donc pas
-- nécessaire à leur fonctionnement — elle ne servirait qu'à un accès DIRECT
-- via PostgREST (`/rest/v1/platform_admins`), que l'application n'utilise
-- jamais (vérifié : aucun `.from("platform_admins")` dans le code livré).
--
-- Une policy SELECT conditionnée uniquement sur « l'appelant est admin »
-- (sans restreindre aux lignes de l'appelant) aurait justement permis à
-- N'IMPORTE QUEL administrateur de lire directement user_id, granted_by et
-- note de TOUS LES AUTRES administrateurs par ce chemin. On l'exclut plutôt
-- que de la restreindre : aucune fonctionnalité de cette version n'a besoin
-- de lire cette table depuis l'application, admin inclus.
--
-- RLS activée sans policy = refus par défaut pour tout rôle non propriétaire,
-- quel que soit le grant. Le revoke explicite est une seconde barrière : même
-- si une policy était ajoutée par erreur plus tard, aucun grant ne rendrait
-- la table lisible par `authenticated` ou `anon` sans un grant delibéré.
--
-- Aucune policy d'écriture n'existe non plus : insert, update et delete sont
-- impossibles depuis l'application, quel que soit le rôle. L'octroi passe par
-- le service role uniquement (voir §9).

alter table public.platform_admins enable row level security;

drop policy if exists platform_admins_select on public.platform_admins;

revoke all on public.platform_admins from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC de lecture — vue d'ensemble
-- ---------------------------------------------------------------------------
-- Chaque RPC appelle assert_platform_admin() EN PREMIER. La garde est donc
-- vérifiée à chaque opération, pas seulement à l'affichage de la page.
--
-- Aucune de ces RPC n'expose : identité de locataire, coordonnées, montants de
-- loyer, documents, références de paiement, jetons ou secrets. Uniquement des
-- agrégats et des métadonnées d'Organization.

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
-- 5. RPC de lecture — Organizations paginées
-- ---------------------------------------------------------------------------
-- Renvoie un OBJET jsonb `{ rows, total_count, limit, offset }` plutôt qu'un
-- jeu de lignes portant total_count sur chaque ligne.
--
-- Raison : avec `returns table (...)`, total_count n'était porté que par les
-- lignes de PAGE renvoyées. Avec un offset au-delà de la dernière ligne (page
-- vide mais Organizations existantes), la requête renvoie ZÉRO ligne — donc
-- ZÉRO porteur pour total_count, que l'appelant lisait alors comme 0. Le total
-- réel devenait ainsi faussement nul dès qu'on dépassait la dernière page,
-- alors que la base contenait des données. Un objet jsonb unique est toujours
-- renvoyé, page vide ou non : total_count reste correct dans tous les cas.

create or replace function public.admin_list_organizations(
  page_limit  integer default 25,
  page_offset integer default 0
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
  total       bigint;
  page_rows   jsonb;
begin
  perform private.assert_platform_admin();

  -- Pagination bornée : une limite non contrainte permettrait d'extraire la
  -- base entière en une requête.
  safe_limit  := least(greatest(coalesce(page_limit, 25), 1), 100);
  safe_offset := greatest(coalesce(page_offset, 0), 0);

  -- Total calculé indépendamment de la page : toujours correct, même quand
  -- l'offset demandé dépasse la dernière ligne existante.
  select count(*) into total from public.organizations;

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

revoke all on function public.admin_list_organizations(integer, integer) from public, anon;
grant execute on function public.admin_list_organizations(integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC de lecture — Abonnements paginés
-- ---------------------------------------------------------------------------
-- `provider_customer_ref`, `provider_subscription_ref`, la marque et les quatre
-- derniers chiffres du moyen de paiement sont VOLONTAIREMENT EXCLUS : la
-- console de suivi n'en a pas besoin, et ils constituent des données de
-- paiement au sens de la consigne ADMIN-01 §6.
--
-- Même correction de pagination qu'en §5 : objet jsonb `{ rows, total_count,
-- limit, offset }`, pour que total_count reste correct même quand l'offset
-- demandé dépasse la dernière ligne existante.

create or replace function public.admin_list_subscriptions(
  page_limit  integer default 25,
  page_offset integer default 0
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
  total       bigint;
  page_rows   jsonb;
begin
  perform private.assert_platform_admin();

  safe_limit  := least(greatest(coalesce(page_limit, 25), 1), 100);
  safe_offset := greatest(coalesce(page_offset, 0), 0);

  select count(*) into total from public.organization_subscriptions;

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
      -- Booléen seulement : la référence elle-même ne sort jamais.
      (s.provider is not null) as has_provider,
      s.updated_at
    from public.organization_subscriptions s
    left join public.organization_profiles p on p.organization_id = s.organization_id
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

revoke all on function public.admin_list_subscriptions(integer, integer) from public, anon;
grant execute on function public.admin_list_subscriptions(integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPC de lecture — Événements internes récents
-- ---------------------------------------------------------------------------
-- Source : billing_events, déjà enregistrés par l'application. Le champ
-- `payload` n'est PAS exposé : il peut contenir des détails de facturation.
-- Seuls le type, l'Organization et l'horodatage remontent.

create or replace function public.admin_recent_events(
  page_limit integer default 50
)
returns table (
  event_id        uuid,
  organization_id uuid,
  event_type      text,
  occurred_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_limit integer;
begin
  perform private.assert_platform_admin();

  safe_limit := least(greatest(coalesce(page_limit, 50), 1), 200);

  return query
  select e.id, e.organization_id, e.event_type::text, e.created_at
  from public.billing_events e
  order by e.created_at desc, e.id
  limit safe_limit;
end;
$$;

revoke all on function public.admin_recent_events(integer) from public, anon;
grant execute on function public.admin_recent_events(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Fraîcheur des données de suivi
-- ---------------------------------------------------------------------------
-- Renvoie l'horodatage de l'événement interne le plus récent. La console s'en
-- sert pour distinguer « données récentes » de « données anciennes ».
-- Null = aucun événement : l'application n'affiche alors PAS « normal ».

create or replace function public.admin_events_freshness()
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  latest timestamptz;
begin
  perform private.assert_platform_admin();
  select max(created_at) into latest from public.billing_events;
  return latest;
end;
$$;

revoke all on function public.admin_events_freshness() from public, anon;
grant execute on function public.admin_events_freshness() to authenticated;

-- =============================================================================
-- OCTROI DU RÔLE — hors application, service role uniquement
-- =============================================================================
-- Aucune policy d'insertion n'existe sur platform_admins. Pour désigner le
-- premier administrateur, exécuter depuis le SQL editor Supabase (service role) :
--
--   insert into public.platform_admins (user_id, note)
--   select id, 'ADMIN-01 — administrateur initial'
--   from auth.users
--   where email = 'REMPLACER_PAR_EMAIL'
--   on conflict (user_id) do nothing;
--
-- Pour révoquer :
--
--   delete from public.platform_admins
--   where user_id = (select id from auth.users where email = 'REMPLACER_PAR_EMAIL');
--
-- Ne jamais coder d'adresse en dur dans une migration : le fichier est
-- versionné et l'octroi doit rester une opération délibérée et traçable.
-- =============================================================================
