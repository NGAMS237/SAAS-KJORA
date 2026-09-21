begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- =============================================================================
-- KJORA — ADMIN-01 — Tests RLS/RPC exécutables (revue avant validation SQL)
-- =============================================================================
-- Même convention que les autres fichiers de supabase/tests/database/ : tout
-- s'exécute dans une transaction annulée (rollback) — aucune donnée ni aucun
-- utilisateur créés par ce fichier ne survit à son exécution. Seul le SCHÉMA
-- (créé par les migrations, appliquées séparément et en amont) doit déjà être
-- en place.
--
-- Prérequis pour exécuter ce fichier :
--   1. Toutes les migrations du dépôt jusqu'à
--      20260918120000_admin_01_platform_admin.sql appliquées sur la base cible
--      (schéma KJORA complet : organizations, memberships, tenants,
--      organization_subscriptions, billing_events, etc.).
--   2. `create extension pgtap` disponible (standard sur les projets Supabase).
--   3. Exécuté par un rôle propriétaire des tables (ex. postgres via le SQL
--      Editor Supabase ou `supabase test db`) — PAS par la clé anon/service
--      d'une connexion applicative. C'est ce rôle par défaut, avant tout
--      `set local role`, qui joue l'« acteur privilégié » du §5 : c'est lui
--      qui octroie le premier platform_admin plus bas.
--
-- N'A PAS ÉTÉ EXÉCUTÉ dans cette session : voir ADMIN-01-REPORT.md pour la
-- raison précise (l'organisation Supabase est plafonnée à 2 projets gratuits
-- actifs, déjà occupés par KJORA et un autre projet réel — aucune base isolée
-- disponible pour cette revue). Ce fichier est prêt à l'emploi pour une
-- exécution manuelle dès qu'une base isolée sera disponible.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Fixture — écrite par l'« acteur privilégié » (rôle de connexion par défaut)
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('ad000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-ad01@kjora.test', now(), now(), now()),
  ('ad000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-ad01@kjora.test', now(), now(), now()),
  ('ad000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'manager-ad01@kjora.test', now(), now(), now()),
  ('ad000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'tenant-ad01@kjora.test', now(), now(), now());

insert into public.organizations (id, created_by, status) values
  ('ad100000-0000-4000-8000-00000000000a', 'ad000000-0000-4000-8000-000000000002', 'active'),
  ('ad100000-0000-4000-8000-00000000000b', 'ad000000-0000-4000-8000-000000000002', 'active'),
  ('ad100000-0000-4000-8000-00000000000c', 'ad000000-0000-4000-8000-000000000002', 'active');

insert into public.organization_profiles (organization_id, name) values
  ('ad100000-0000-4000-8000-00000000000a', 'ADMIN-01 Org A'),
  ('ad100000-0000-4000-8000-00000000000b', 'ADMIN-01 Org B'),
  ('ad100000-0000-4000-8000-00000000000c', 'ADMIN-01 Org C');

insert into public.memberships (organization_id, user_id, role) values
  ('ad100000-0000-4000-8000-00000000000a', 'ad000000-0000-4000-8000-000000000002', 'organization_owner'),
  ('ad100000-0000-4000-8000-00000000000a', 'ad000000-0000-4000-8000-000000000003', 'manager');

-- « Locataire » : identité portail, sans aucune Membership — vérifie que
-- l'absence de rôle interne n'est jamais confondue avec un accès plateforme.
insert into public.tenants (id, organization_id, full_name, email, created_by) values
  ('ad200000-0000-4000-8000-00000000000a', 'ad100000-0000-4000-8000-00000000000a', 'ADMIN-01 Locataire Test', 'tenant-ad01@kjora.test', 'ad000000-0000-4000-8000-000000000002');

insert into public.organization_subscriptions (
  organization_id, status, plan, billing_cycle, currency,
  provider, provider_subscription_ref, payment_method_last4
) values
  ('ad100000-0000-4000-8000-00000000000a', 'active', 'essentiel', 'monthly', 'XAF', null, null, null),
  ('ad100000-0000-4000-8000-00000000000b', 'payment_failed', 'avance', 'monthly', 'XAF', 'stripe', 'sub_should_not_leak', '4242');
-- Org C n'a délibérément AUCUNE ligne d'abonnement : vérifie les valeurs par
-- défaut (coalesce) plutôt qu'une jointure qui échouerait silencieusement.

insert into public.billing_events (id, organization_id, event_type, payload) values
  ('ad300000-0000-4000-8000-00000000000a', 'ad100000-0000-4000-8000-00000000000a', 'subscription_activated', '{"secret": "should-not-leak"}'::jsonb);

-- Octroi du premier platform_admin — hors RLS, comme documenté au §9 de la
-- migration. C'est le seul INSERT de tout ce fichier sur platform_admins.
insert into public.platform_admins (user_id, note) values
  ('ad000000-0000-4000-8000-000000000001', 'ADMIN-01 — fixture de test pgTAP');

-- ---------------------------------------------------------------------------
-- 1. Anonyme — refus systématique
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$select public.is_platform_admin_self()$$,
  '42501', null,
  'anonyme : is_platform_admin_self refusé (aucun grant execute)'
);
select throws_ok(
  $$select public.admin_platform_counters()$$,
  '42501', null,
  'anonyme : admin_platform_counters refusé'
);
select throws_ok(
  $$select * from public.platform_admins$$,
  '42501', null,
  'anonyme : lecture directe de platform_admins refusée'
);

reset role;

-- ---------------------------------------------------------------------------
-- 2. Owner d'Organization — aucun droit plateforme
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000002', true);

select results_eq(
  $$select public.is_platform_admin_self()$$,
  array[false],
  'owner : is_platform_admin_self renvoie faux'
);
select throws_ok(
  $$select public.admin_platform_counters()$$,
  '42501', null,
  'owner : admin_platform_counters refusé malgré organization_owner'
);
select throws_ok(
  $$select public.admin_list_organizations(10, 0)$$,
  '42501', null,
  'owner : admin_list_organizations refusé'
);
select throws_ok(
  $$select public.admin_list_subscriptions(10, 0)$$,
  '42501', null,
  'owner : admin_list_subscriptions refusé'
);
select throws_ok(
  $$select public.admin_recent_events(10)$$,
  '42501', null,
  'owner : admin_recent_events refusé'
);
select throws_ok(
  $$select public.admin_events_freshness()$$,
  '42501', null,
  'owner : admin_events_freshness refusé'
);
select throws_ok(
  $$select * from public.platform_admins$$,
  '42501', null,
  'owner : lecture directe de platform_admins refusée (même en étant admin de SON Organization)'
);

reset role;

-- ---------------------------------------------------------------------------
-- 3. Collaborateur (manager) — même refus, aucune exception de rôle
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000003', true);

select results_eq(
  $$select public.is_platform_admin_self()$$,
  array[false],
  'manager : is_platform_admin_self renvoie faux'
);
select throws_ok(
  $$select public.admin_platform_counters()$$,
  '42501', null,
  'manager : admin_platform_counters refusé'
);
select throws_ok(
  $$select * from public.platform_admins$$,
  '42501', null,
  'manager : lecture directe de platform_admins refusée'
);

reset role;

-- ---------------------------------------------------------------------------
-- 4. Locataire (portail, aucune Membership) — même refus
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000004', true);

select results_eq(
  $$select public.is_platform_admin_self()$$,
  array[false],
  'locataire : is_platform_admin_self renvoie faux'
);
select throws_ok(
  $$select public.admin_platform_counters()$$,
  '42501', null,
  'locataire : admin_platform_counters refusé'
);
select throws_ok(
  $$select * from public.platform_admins$$,
  '42501', null,
  'locataire : lecture directe de platform_admins refusée'
);

reset role;

-- ---------------------------------------------------------------------------
-- 5. Platform admin — accès accordé, mais TOUJOURS lecture seule
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select public.is_platform_admin_self()$$,
  array[true],
  'admin : is_platform_admin_self renvoie vrai'
);

-- Point central de la revue (§1) : même un admin ne lit jamais platform_admins
-- directement — aucun grant ni policy SELECT ne subsiste sur cette table.
select throws_ok(
  $$select * from public.platform_admins$$,
  '42501', null,
  'admin : lecture directe de platform_admins TOUJOURS refusée'
);

-- Aucune écriture possible depuis l'application, admin inclus.
select throws_ok(
  $$insert into public.platform_admins (user_id) values ('ad000000-0000-4000-8000-000000000003')$$,
  '42501', null,
  'admin : ne peut pas octroyer le rôle à un tiers depuis l''application'
);
select throws_ok(
  $$update public.platform_admins set note = 'x' where user_id = 'ad000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'admin : ne peut pas modifier sa propre ligne depuis l''application'
);
select throws_ok(
  $$delete from public.platform_admins where user_id = 'ad000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'admin : ne peut pas se révoquer lui-même depuis l''application'
);

select lives_ok(
  $$select public.admin_platform_counters()$$,
  'admin : admin_platform_counters s''exécute'
);
select results_eq(
  $$select (public.admin_platform_counters() ->> 'organizations_total')::bigint$$,
  $$select count(*) from public.organizations$$,
  'admin : organizations_total correspond au compte réel'
);

select lives_ok(
  $$select public.admin_list_organizations(10, 0)$$,
  'admin : admin_list_organizations s''exécute'
);
select results_eq(
  $$select (public.admin_list_organizations(10, 0) ->> 'total_count')::bigint$$,
  $$select count(*) from public.organizations$$,
  'admin : total_count (organizations) correspond au compte réel'
);

-- --- Correctif de pagination (§2 de cette revue) ---------------------------
-- Offset délibérément au-delà de la dernière ligne existante : le total ne
-- doit PAS devenir faussement zéro, et la page doit être vide.
select results_eq(
  $$select jsonb_array_length(public.admin_list_organizations(5, 999999) -> 'rows')$$,
  array[0],
  'admin : page vide quand l''offset dépasse la dernière ligne (organizations)'
);
select results_eq(
  $$select (public.admin_list_organizations(5, 999999) ->> 'total_count')::bigint$$,
  $$select count(*) from public.organizations$$,
  'admin : total_count reste exact malgré un offset hors limites (organizations)'
);
select results_eq(
  $$select jsonb_array_length(public.admin_list_subscriptions(5, 999999) -> 'rows')$$,
  array[0],
  'admin : page vide quand l''offset dépasse la dernière ligne (abonnements)'
);
select results_eq(
  $$select (public.admin_list_subscriptions(5, 999999) ->> 'total_count')::bigint$$,
  $$select count(*) from public.organization_subscriptions$$,
  'admin : total_count reste exact malgré un offset hors limites (abonnements)'
);

-- --- Isolation des données exposées -----------------------------------------
select ok(
  (
    not exists (
      select 1
      from jsonb_array_elements(public.admin_list_subscriptions(50, 0) -> 'rows') row_data
      where row_data ? 'provider_subscription_ref'
         or row_data ? 'provider_customer_ref'
         or row_data ? 'payment_method_brand'
         or row_data ? 'payment_method_last4'
         or row_data ? 'payment_method_expires_on'
    )
  ),
  'admin : aucune référence fournisseur ni moyen de paiement dans admin_list_subscriptions'
);
select is(
  (
    select (row_data ->> 'has_provider')::boolean
    from jsonb_array_elements(public.admin_list_subscriptions(50, 0) -> 'rows') row_data
    where row_data ->> 'organization_id' = 'ad100000-0000-4000-8000-00000000000b'
  ),
  true,
  'admin : has_provider vrai pour l''Organization B (fournisseur présent, référence tue)'
);
select is(
  (
    select coalesce(row_data ->> 'plan', 'decouverte')
    from jsonb_array_elements(public.admin_list_organizations(50, 0) -> 'rows') row_data
    where row_data ->> 'organization_id' = 'ad100000-0000-4000-8000-00000000000c'
  ),
  'decouverte',
  'admin : Organization C sans abonnement retombe sur le plan par défaut'
);

select lives_ok(
  $$select public.admin_recent_events(10)$$,
  'admin : admin_recent_events s''exécute'
);
select ok(
  not exists (
    select 1 from public.admin_recent_events(50) e
    where to_jsonb(e) ? 'payload'
  ),
  'admin : le payload des événements n''est jamais exposé'
);

select lives_ok(
  $$select public.admin_events_freshness()$$,
  'admin : admin_events_freshness s''exécute'
);
select isnt(
  (select public.admin_events_freshness()),
  null,
  'admin : admin_events_freshness renvoie une date (événement de fixture présent)'
);

reset role;

select * from finish();
rollback;
