begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- =============================================================================
-- KJORA — ADMIN-01.1 — Tests RLS/RPC des quick wins UX
-- =============================================================================
-- Convention identique à rls_admin_01_platform_admin.test.sql : tout s'exécute
-- dans une transaction annulée (rollback), fixture dédiée, préfixe UUID propre
-- (`ae0…`/`ae1…`) pour ne jamais entrer en collision avec la fixture ADMIN-01
-- si les deux fichiers sont un jour combinés.
--
-- Prérequis : migrations jusqu'à 20260921120000_admin_01_1_ux_quick_wins.sql
-- appliquées sur la base cible.
--
-- N'A PAS ÉTÉ EXÉCUTÉ dans cette session (même limite que ADMIN-01 : aucune
-- base isolée disponible — organisation Supabase plafonnée à deux projets
-- gratuits actifs). Prêt à l'emploi pour la CI éphémère existante.
-- =============================================================================

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('ae000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-ae01@kjora.test', now(), now(), now());

insert into public.organizations (id, created_by, status) values
  ('ae100000-0000-4000-8000-00000000000a', 'ae000000-0000-4000-8000-000000000001', 'active'),
  ('ae100000-0000-4000-8000-00000000000b', 'ae000000-0000-4000-8000-000000000001', 'suspended'),
  ('ae100000-0000-4000-8000-00000000000c', 'ae000000-0000-4000-8000-000000000001', 'active'),
  ('ae100000-0000-4000-8000-00000000000d', 'ae000000-0000-4000-8000-000000000001', 'active');

insert into public.organization_profiles (organization_id, name) values
  ('ae100000-0000-4000-8000-00000000000a', 'Kjora Test Alpha'),
  ('ae100000-0000-4000-8000-00000000000b', 'Kjora Test Beta'),
  ('ae100000-0000-4000-8000-00000000000c', 'Zenith Gamma'),
  ('ae100000-0000-4000-8000-00000000000d', 'Mismatch Delta');

-- Forfait EFFECTIF : les quatre Organizations en ont un, comme dans la vraie
-- base KJORA Dev (constat de l'audit ADMIN-01.1 : organization_plans couvre
-- toujours 100 % des Organizations, contrairement à organization_subscriptions).
insert into public.organization_plans (organization_id, plan) values
  ('ae100000-0000-4000-8000-00000000000a', 'decouverte'),
  ('ae100000-0000-4000-8000-00000000000b', 'essentiel'),
  ('ae100000-0000-4000-8000-00000000000c', 'avance'),
  ('ae100000-0000-4000-8000-00000000000d', 'essentiel')
on conflict (organization_id) do update
set plan = excluded.plan;

-- Org B : abonnement enregistré cohérent avec son forfait effectif (essentiel/payant).
-- Org D : reproduit EXACTEMENT la divergence constatée sur KJORA Dev — forfait
-- effectif payant (essentiel), mais abonnement RÉELLEMENT enregistré gratuit
-- (decouverte/free). Doit compter comme abonnement gratuit ET incohérence,
-- jamais comme abonnement payant.
-- Org A et C : aucune ligne — "sans abonnement enregistré", ni gratuites ni payantes.
-- Org D sur le marché CA/CAD (et non CM/XAF) : la fixture respecte la
-- contrainte pays/devise et ne fausse pas le filtre XAF visant l'Org B.
insert into public.organization_subscriptions (
  organization_id, status, plan, billing_cycle, billing_country, currency
) values
  ('ae100000-0000-4000-8000-00000000000b', 'active', 'essentiel', 'monthly', 'CM', 'XAF'),
  ('ae100000-0000-4000-8000-00000000000d', 'free', 'decouverte', 'monthly', 'CA', 'CAD');

insert into public.platform_admins (user_id, note) values
  ('ae000000-0000-4000-8000-000000000001', 'ADMIN-01.1 — fixture de test pgTAP');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ae000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 1. Compteurs — abonnements RÉELLEMENT enregistrés uniquement (Option A)
-- ---------------------------------------------------------------------------
-- Jamais organization_plans (forfait effectif) pour classer gratuit/payant :
-- seule organization_subscriptions fait foi. Org D est le cas central : son
-- forfait effectif est payant (essentiel) mais son abonnement enregistré est
-- gratuit (decouverte/free) — elle doit compter comme GRATUITE, jamais payante,
-- et déclencher l'indicateur d'incohérence.

select results_eq(
  $$select (public.admin_platform_counters() ->> 'subscriptions_free')::bigint$$,
  array[1::bigint],
  'admin : un seul abonnement enregistré gratuit (Org D, malgré son forfait effectif payant)'
);
select results_eq(
  $$select (public.admin_platform_counters() ->> 'subscriptions_paid')::bigint$$,
  array[1::bigint],
  'admin : un seul abonnement enregistré payant (Org B)'
);
select results_eq(
  $$select (public.admin_platform_counters() ->> 'organizations_without_subscription')::bigint$$,
  array[2::bigint],
  'admin : deux Organizations sans aucun abonnement enregistré (A et C), ni gratuites ni payantes'
);
select results_eq(
  $$select (public.admin_platform_counters() ->> 'plan_billing_mismatches')::bigint$$,
  array[1::bigint],
  'admin : une seule incohérence forfait/facturation détectée (Org D)'
);

-- ---------------------------------------------------------------------------
-- 2. Organizations — recherche par nom
-- ---------------------------------------------------------------------------

select results_eq(
  $$select (public.admin_list_organizations(25, 0, 'Kjora Test', null) ->> 'total_count')::bigint$$,
  array[2::bigint],
  'admin : recherche "Kjora Test" trouve exactement 2 Organizations'
);
select results_eq(
  $$select (public.admin_list_organizations(25, 0, 'zenith', null) ->> 'total_count')::bigint$$,
  array[1::bigint],
  'admin : recherche insensible à la casse ("zenith" trouve "Zenith Gamma")'
);
select results_eq(
  $$select (public.admin_list_organizations(25, 0, 'introuvable-xyz', null) ->> 'total_count')::bigint$$,
  array[0::bigint],
  'admin : recherche sans résultat renvoie un total à zéro, pas une erreur'
);

-- ---------------------------------------------------------------------------
-- 3. Organizations — filtre statut
-- ---------------------------------------------------------------------------

select results_eq(
  $$select (public.admin_list_organizations(25, 0, null, 'suspended') ->> 'total_count')::bigint$$,
  array[1::bigint],
  'admin : filtre statut "suspended" trouve exactement 1 Organization'
);

-- ---------------------------------------------------------------------------
-- 4. Organizations — recherche + filtre combinés, et total cohérent avec la
--    pagination même quand un filtre est actif (même garde que le correctif
--    ADMIN-01 sur l'offset hors limites, désormais vérifiée sous filtre).
-- ---------------------------------------------------------------------------

select results_eq(
  $$select (public.admin_list_organizations(25, 0, 'Kjora', 'active') ->> 'total_count')::bigint$$,
  array[1::bigint],
  'admin : recherche + filtre statut combinés (Kjora + active) ne trouve que Alpha'
);
select results_eq(
  $$select jsonb_array_length(public.admin_list_organizations(5, 999999, 'Kjora Test', null) -> 'rows')$$,
  array[0],
  'admin : page vide quand l''offset dépasse la dernière ligne FILTRÉE'
);
select results_eq(
  $$select (public.admin_list_organizations(5, 999999, 'Kjora Test', null) ->> 'total_count')::bigint$$,
  array[2::bigint],
  'admin : total_count filtré reste exact malgré un offset hors limites'
);

-- ---------------------------------------------------------------------------
-- 5. Abonnements — recherche, filtres forfait/statut/devise
-- ---------------------------------------------------------------------------

select results_eq(
  $$select (public.admin_list_subscriptions(25, 0, 'Beta', null, null, null) ->> 'total_count')::bigint$$,
  array[1::bigint],
  'admin : recherche abonnement par nom d''Organization'
);
select results_eq(
  $$select (public.admin_list_subscriptions(25, 0, null, 'essentiel', null, null) ->> 'total_count')::bigint$$,
  array[1::bigint],
  'admin : filtre abonnement par forfait'
);
select results_eq(
  $$select (public.admin_list_subscriptions(25, 0, null, null, 'active', null) ->> 'total_count')::bigint$$,
  array[1::bigint],
  'admin : filtre abonnement par statut'
);
select results_eq(
  $$select (public.admin_list_subscriptions(25, 0, null, null, null, 'XAF') ->> 'total_count')::bigint$$,
  array[1::bigint],
  'admin : filtre abonnement par devise'
);
select results_eq(
  $$select (public.admin_list_subscriptions(25, 0, null, 'inexistant-xyz', null, null) ->> 'total_count')::bigint$$,
  array[0::bigint],
  'admin : filtre abonnement forfait sans correspondance renvoie zéro, pas une erreur'
);

-- ---------------------------------------------------------------------------
-- 6. Refus — les nouveaux paramètres ne créent aucun chemin de contournement
-- ---------------------------------------------------------------------------

reset role;
set local role anon;

select throws_ok(
  $$select public.admin_list_organizations(10, 0, 'x', null)$$,
  '42501', null,
  'anonyme : admin_list_organizations toujours refusé, y compris avec un filtre'
);

reset role;

select * from finish();
rollback;
