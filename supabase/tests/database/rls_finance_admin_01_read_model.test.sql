begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- =============================================================================
-- KJORA — FINANCE-ADMIN-01 — Tests RLS/RPC exécutables (aperçu financier)
-- =============================================================================
-- Même convention que rls_admin_billing_ops_01_commercial_interventions
-- .test.sql : tout s'exécute dans une transaction annulée (rollback). Aucune
-- donnée créée ici ne survit à l'exécution.
--
-- Prérequis pour exécuter ce fichier :
--   1. Toutes les migrations du dépôt jusqu'à
--      20260927090000_finance_admin_01_read_model.sql appliquées sur la base
--      cible (schéma ADMIN-BILLING-OPS-01 inclus : commercial_interventions).
--   2. `create extension pgtap` disponible.
--   3. Exécuté par un rôle propriétaire des tables, jamais par anon/service.
--
-- N'A PAS ÉTÉ EXÉCUTÉ dans cette session : aucune base Postgres/Supabase
-- éphémère n'est disponible dans ce bac à sable, et le mandat interdit
-- explicitement d'appliquer cette migration sur Supabase Dev/Production ce
-- tour-ci. Ce fichier est prêt pour une exécution manuelle ou via la CI
-- GitHub Actions existante (Supabase isolée) dès que ce lot y sera soumis.
--
-- Isolation des identifiants : préfixe `fa` (Finance Admin), réservé à ce
-- fichier, pour ne jamais entrer en collision avec `ad…`/`ae…`/`cb…` déjà
-- utilisés par les fixtures des autres lots.
-- =============================================================================

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('fa000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-fa01@kjora.test', now(), now(), now()),
  ('fa000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-fa01@kjora.test', now(), now(), now()),
  ('fa000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'manager-fa01@kjora.test', now(), now(), now()),
  ('fa000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'tenant-fa01@kjora.test', now(), now(), now());

-- Org A : abonnement réel payant XAF + un paiement hors ligne (compte comme encaissé).
-- Org B : abonnement réel payant CAD + une gratuité (ne doit JAMAIS compter comme encaissé).
-- Org C : abonnement 'sur_mesure' (aucun prix catalogue -> exclu du revenu attendu).
-- Org D : aucun abonnement enregistré (compteur organizations_without_subscription).
insert into public.organizations (id, created_by, status) values
  ('fa100000-0000-4000-8000-00000000000a', 'fa000000-0000-4000-8000-000000000002', 'active'),
  ('fa100000-0000-4000-8000-00000000000b', 'fa000000-0000-4000-8000-000000000002', 'active'),
  ('fa100000-0000-4000-8000-00000000000c', 'fa000000-0000-4000-8000-000000000002', 'active'),
  ('fa100000-0000-4000-8000-00000000000d', 'fa000000-0000-4000-8000-000000000002', 'active');

insert into public.organization_profiles (organization_id, name) values
  ('fa100000-0000-4000-8000-00000000000a', 'FINANCE-ADMIN-01 Org A'),
  ('fa100000-0000-4000-8000-00000000000b', 'FINANCE-ADMIN-01 Org B'),
  ('fa100000-0000-4000-8000-00000000000c', 'FINANCE-ADMIN-01 Org C'),
  ('fa100000-0000-4000-8000-00000000000d', 'FINANCE-ADMIN-01 Org D');

insert into public.memberships (organization_id, user_id, role) values
  ('fa100000-0000-4000-8000-00000000000a', 'fa000000-0000-4000-8000-000000000002', 'organization_owner'),
  ('fa100000-0000-4000-8000-00000000000a', 'fa000000-0000-4000-8000-000000000003', 'manager');

insert into public.tenants (id, organization_id, full_name, email, created_by) values
  ('fa200000-0000-4000-8000-00000000000a', 'fa100000-0000-4000-8000-00000000000a', 'FINANCE-ADMIN-01 Locataire Test', 'tenant-fa01@kjora.test', 'fa000000-0000-4000-8000-000000000002');

insert into public.organization_subscriptions (organization_id, status, plan, billing_cycle, currency) values
  ('fa100000-0000-4000-8000-00000000000a', 'active', 'essentiel', 'monthly', 'XAF'),
  ('fa100000-0000-4000-8000-00000000000b', 'active', 'avance',    'monthly', 'CAD'),
  ('fa100000-0000-4000-8000-00000000000c', 'active', 'sur_mesure','monthly', 'XAF');
-- Org D : aucune ligne organization_subscriptions (repli 'organizations_without_subscription').

insert into public.billing_events (organization_id, event_type, from_status, to_status) values
  ('fa100000-0000-4000-8000-00000000000a', 'subscription_activated', 'free', 'active');

insert into public.commercial_interventions
  (organization_id, intervention_type, reason_code, admin_note, granted_plan, starts_on, ends_on,
   currency, amount_minor, manual_reference, status, created_by, idempotency_key)
values
  ('fa100000-0000-4000-8000-00000000000a', 'offline_payment', 'manual_payment_received',
   'Paiement reçu par virement — test FINANCE-ADMIN-01', 'essentiel', current_date, null,
   'XAF', 5000, 'RECU-FA-001', 'active', 'fa000000-0000-4000-8000-000000000001', 'fa01-offline-a'),
  ('fa100000-0000-4000-8000-00000000000b', 'complimentary', 'sales_gift',
   'Geste commercial offert — test FINANCE-ADMIN-01', 'avance', current_date, current_date + 30,
   null, null, null, 'active', 'fa000000-0000-4000-8000-000000000001', 'fa01-comp-b');

insert into public.platform_admins (user_id, note) values
  ('fa000000-0000-4000-8000-000000000001', 'FINANCE-ADMIN-01 — fixture de test pgTAP');

-- ---------------------------------------------------------------------------
-- 1. Anonyme — refus systématique
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$select public.admin_finance_summary('last_30_days')$$,
  '42501', null,
  'anonyme : admin_finance_summary refusé'
);
select throws_ok(
  $$select public.admin_finance_recent_events(25, 0, 'last_30_days')$$,
  '42501', null,
  'anonyme : admin_finance_recent_events refusé'
);
select throws_ok(
  $$select * from public.commercial_interventions$$,
  '42501', null,
  'anonyme : lecture directe de commercial_interventions refusée'
);

reset role;

-- ---------------------------------------------------------------------------
-- 2. Owner d'Organization — refusé, y compris sur SA propre Organization
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.admin_finance_summary('all_time')$$,
  '42501', null,
  'owner : admin_finance_summary refusé'
);
select throws_ok(
  $$select public.admin_finance_recent_events(25, 0, 'all_time')$$,
  '42501', null,
  'owner : admin_finance_recent_events refusé'
);

reset role;

-- ---------------------------------------------------------------------------
-- 3. Collaborateur (manager) — refusé
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000003', true);

select throws_ok(
  $$select public.admin_finance_summary('all_time')$$,
  '42501', null,
  'manager : admin_finance_summary refusé'
);
select throws_ok(
  $$select public.admin_finance_recent_events(25, 0, 'all_time')$$,
  '42501', null,
  'manager : admin_finance_recent_events refusé'
);

reset role;

-- ---------------------------------------------------------------------------
-- 4. Locataire — refusé
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000004', true);

select throws_ok(
  $$select public.admin_finance_summary('all_time')$$,
  '42501', null,
  'locataire : admin_finance_summary refusé'
);
select throws_ok(
  $$select public.admin_finance_recent_events(25, 0, 'all_time')$$,
  '42501', null,
  'locataire : admin_finance_recent_events refusé'
);

reset role;

-- ---------------------------------------------------------------------------
-- 5. platform_admin — autorisé, résultats vérifiés
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.admin_finance_summary('all_time')$$,
  'platform_admin : admin_finance_summary autorisé'
);
select lives_ok(
  $$select public.admin_finance_recent_events(25, 0, 'all_time')$$,
  'platform_admin : admin_finance_recent_events autorisé'
);

-- CAD/XAF jamais additionnées : deux clés distinctes, jamais un total fusionné.
select ok(
  (select (public.admin_finance_summary('all_time')->'charts'->'expected_revenue_by_currency') ? 'XAF'),
  'revenu attendu : la clé XAF existe séparément'
);
select ok(
  (select (public.admin_finance_summary('all_time')->'charts'->'expected_revenue_by_currency') ? 'CAD'),
  'revenu attendu : la clé CAD existe séparément'
);
select isnt(
  (select public.admin_finance_summary('all_time')->'charts'->'expected_revenue_by_currency' ? 'XAF_CAD'),
  true,
  'revenu attendu : aucune clé fusionnée XAF+CAD'
);

-- Org A (essentiel/monthly/XAF, prix catalogue 5900) est la seule à contribuer
-- au XAF attendu ; Org C (sur_mesure) est structurellement exclue.
select is(
  (select (public.admin_finance_summary('all_time')->'charts'->'expected_revenue_by_currency'->>'XAF')::bigint),
  5900::bigint,
  'revenu attendu XAF = uniquement Org A (essentiel), Org C (sur_mesure) exclue'
);
select is(
  (select (public.admin_finance_summary('all_time')->'charts'->'expected_revenue_by_currency'->>'CAD')::bigint),
  3199::bigint,
  'revenu attendu CAD = uniquement Org B (avance)'
);

-- Encaissé hors ligne : seule Org A (offline_payment) compte, jamais Org B (complimentary).
select is(
  (select (public.admin_finance_summary('all_time')->'collected_revenue'->'offline_by_currency'->>'XAF')::bigint),
  5000::bigint,
  'encaissé hors ligne XAF = paiement réel Org A uniquement'
);
select ok(
  not (public.admin_finance_summary('all_time')->'collected_revenue'->'offline_by_currency' ? 'CAD')
  or (public.admin_finance_summary('all_time')->'collected_revenue'->'offline_by_currency'->>'CAD')::bigint = 0,
  'une intervention offerte (complimentary) n''est jamais comptée comme encaissée'
);

-- Stripe / Mobile Money : toujours NON CONNECTÉ, jamais un état "normal".
select is(
  (select public.admin_finance_summary('all_time')->'collected_revenue'->>'stripe_connected'),
  'false',
  'Stripe : jamais présenté comme encaissé'
);
select is(
  (select public.admin_finance_summary('all_time')->'connectors'->'stripe'->>'state'),
  'not_connected',
  'Stripe : état connecteur NON CONNECTÉ'
);
select is(
  (select public.admin_finance_summary('all_time')->'connectors'->'mobile_money'->>'state'),
  'not_connected',
  'Mobile Money : état connecteur NON CONNECTÉ'
);

-- Événements récents : aucune colonne sensible dans les lignes renvoyées.
select ok(
  not exists (
    select 1
    from jsonb_array_elements(public.admin_finance_recent_events(25, 0, 'all_time')->'rows') as row
    where row ? 'payload' or row ? 'provider_event_id' or row ? 'admin_note'
       or row ? 'manual_reference' or row ? 'idempotency_key' or row ? 'revoke_reason'
  ),
  'aucune colonne sensible dans les événements financiers renvoyés'
);

-- Pagination cohérente : le total ne varie pas selon la page demandée.
select is(
  (select (public.admin_finance_recent_events(1, 0, 'all_time')->>'total_count')::bigint),
  (select (public.admin_finance_recent_events(1, 100, 'all_time')->>'total_count')::bigint),
  'total_count identique quelle que soit la page demandée'
);

-- Limites hors bornes : clampées silencieusement (même convention que
-- admin_list_organizations/admin_list_subscriptions — jamais une erreur, mais
-- jamais non plus une valeur hors bornes appliquée telle quelle).
select is(
  (select (public.admin_finance_recent_events(99999, 0, 'all_time')->>'limit')::int),
  100,
  'une limite excessive est clampée à 100, jamais appliquée telle quelle'
);
select is(
  (select (public.admin_finance_recent_events(-5, -10, 'all_time')->>'offset')::int),
  0,
  'un offset négatif est clampé à 0'
);

-- Période invalide : refusée (exception), jamais silencieusement ramenée à
-- une période par défaut différente de celle demandée.
select throws_ok(
  $$select public.admin_finance_summary('next_week')$$,
  '22023', null,
  'période invalide refusée par admin_finance_summary'
);
select throws_ok(
  $$select public.admin_finance_recent_events(25, 0, 'invalid_period')$$,
  '22023', null,
  'période invalide refusée par admin_finance_recent_events'
);

-- Non-régression ADMIN-01 / ADMIN-BILLING-OPS-01 : toujours appelables.
select lives_ok(
  $$select public.admin_platform_counters()$$,
  'non-régression : admin_platform_counters toujours autorisé pour platform_admin'
);
select lives_ok(
  $$select public.admin_commercial_intervention_counters()$$,
  'non-régression : admin_commercial_intervention_counters toujours autorisé pour platform_admin'
);

reset role;

select * from finish();
rollback;
