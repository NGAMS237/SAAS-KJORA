begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- =============================================================================
-- REVENUE-LAUNCH-01 — Sous-lot 01I — Tests RLS/RPC exécutables
-- =============================================================================
-- Même convention que rls_revenue_01h_admin_lifecycle.test.sql : transaction
-- annulée (rollback), rien ne survit.
--
-- RÉELLEMENT EXÉCUTÉ (Complément REVENUE-LAUNCH-01, cluster PostgreSQL 16
-- local éphémère avec extension pgtap réelle — jamais Supabase distant) :
-- PASS confirmé, `select plan(24)` vérifié contre le nombre réel
-- d'assertions. Corrigé après cette exécution réelle : les lectures de
-- vérification interne (pays, consentement, désabonnement) passaient par un
-- `select ... from public.organization_commercial_contacts` direct, alors
-- que cette table n'accorde AUCUN privilège à `authenticated` (accès
-- exclusif via RPC, par design) — ce qui provoquait un `permission denied`
-- jamais détecté tant que ce fichier n'avait été que lu, jamais exécuté.
-- Ces lectures passent désormais par admin_list_commercial_contacts_for_export(),
-- la même RPC de lecture Admin que l'application utilise réellement.
--
-- Isolation des identifiants : préfixe `09` (Revenue 01I), réservé à ce
-- fichier.
-- =============================================================================

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('09000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-ri01@kjora.test', now(), now(), now()),
  ('09000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-ri01@kjora.test', now(), now(), now());

insert into public.platform_admins (user_id) values ('09000000-0000-4000-8000-000000000001');

insert into public.organizations (id, created_by, status) values
  ('09100000-0000-4000-8000-00000000000a', '09000000-0000-4000-8000-000000000002', 'active');

insert into public.organization_profiles (organization_id, name) values
  ('09100000-0000-4000-8000-00000000000a', 'REVENUE-01I Org A');

insert into public.memberships (organization_id, user_id, role, status) values
  ('09100000-0000-4000-8000-00000000000a', '09000000-0000-4000-8000-000000000002', 'organization_owner', 'active');

set local role authenticated;
select set_config('request.jwt.claim.sub', '09000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 1. Consentement impossible avant qu'une fiche contact existe
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_set_marketing_consent('09100000-0000-4000-8000-00000000000a', true, 'admin_manual_entry') ->> 'outcome'),
  'contact_not_found',
  'admin_set_marketing_consent refuse tant qu''aucune fiche contact n''existe'
);

-- ---------------------------------------------------------------------------
-- 2. Créer / mettre à jour la fiche contact — validations
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_upsert_organization_contact('09100000-0000-4000-8000-00000000000a', null, '', 'fr') ->> 'outcome'),
  'country_required',
  'le pays est obligatoire'
);

select is(
  (select public.admin_upsert_organization_contact('09100000-0000-4000-8000-00000000000a', null, 'Canada', 'de') ->> 'outcome'),
  'invalid_language',
  'la langue doit être fr ou en'
);

select is(
  (select public.admin_upsert_organization_contact('09100000-0000-4000-8000-00000000000a', '12', 'Canada', 'fr') ->> 'outcome'),
  'invalid_phone',
  'un téléphone trop court est refusé'
);

select is(
  (select public.admin_upsert_organization_contact('09100000-0000-4000-8000-00000000000a', '+1 514 555 0100', 'Canada', 'fr') ->> 'outcome'),
  'saved',
  'admin_upsert_organization_contact enregistre une fiche valide'
);

select is(
  (select country from public.admin_list_commercial_contacts_for_export() where organization_name = 'REVENUE-01I Org A'),
  'Canada',
  'le pays est bien enregistré, distinct de organization_profiles.country_code (verrouillé à CM)'
);

-- Idempotence de l'upsert : une seconde saisie met à jour, ne duplique jamais.
select is(
  (select public.admin_upsert_organization_contact('09100000-0000-4000-8000-00000000000a', '+1 514 555 0199', 'Canada', 'en') ->> 'outcome'),
  'saved',
  'un second appel met à jour la même fiche (upsert)'
);

select is(
  (select count(*)::int from public.admin_list_commercial_contacts_for_export() where organization_name = 'REVENUE-01I Org A'),
  1,
  'une seule ligne existe malgré deux appels (jamais de doublon)'
);

-- ---------------------------------------------------------------------------
-- 3. Consentement — accord, source obligatoire, désabonnement, exclusivité
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_set_marketing_consent('09100000-0000-4000-8000-00000000000a', true, 'invalid_source_value') ->> 'outcome'),
  'invalid_source',
  'une source de consentement hors liste fermée est refusée'
);

-- Consentement versionné et prouvé (v3) : un accord sans version connue ou
-- sans preuve est refusé, jamais enregistré à moitié.
select is(
  (select public.admin_set_marketing_consent('09100000-0000-4000-8000-00000000000a', true, 'admin_manual_entry', 'marketing-v0', 'Accord écrit reçu par courriel') ->> 'outcome'),
  'invalid_consent_version',
  'un accord avec une version de texte inconnue est refusé'
);

select is(
  (select public.admin_set_marketing_consent('09100000-0000-4000-8000-00000000000a', true, 'admin_manual_entry', 'kjora-marketing-v1', null) ->> 'outcome'),
  'consent_evidence_required',
  'un accord sans preuve est refusé'
);

select is(
  (select public.admin_set_marketing_consent('09100000-0000-4000-8000-00000000000a', true, 'admin_manual_entry', 'kjora-marketing-v1', 'Accord écrit reçu par courriel le 2026-09-27') ->> 'outcome'),
  'consent_updated',
  'admin_set_marketing_consent enregistre un accord valide (version + preuve)'
);

select is(
  (select consent_version from public.admin_list_commercial_contacts_for_export() where organization_name = 'REVENUE-01I Org A'),
  'kjora-marketing-v1',
  'la version du texte de consentement est exposée dans l''export'
);

select is(
  (select marketing_consent from public.admin_list_commercial_contacts_for_export() where organization_name = 'REVENUE-01I Org A'),
  true,
  'marketing_consent passe bien à true'
);

select is(
  (select marketing_consent_at is not null from public.admin_list_commercial_contacts_for_export() where organization_name = 'REVENUE-01I Org A'),
  true,
  'marketing_consent_at est bien horodaté'
);

select is(
  (select public.admin_set_marketing_consent('09100000-0000-4000-8000-00000000000a', false, 'admin_manual_entry') ->> 'outcome'),
  'consent_updated',
  'admin_set_marketing_consent enregistre un désabonnement'
);

-- Journal immuable : chaque décision (y compris le retrait) est une ligne,
-- dans l'ordre, jamais réécrite.
select is(
  (select count(*)::int from public.admin_list_marketing_consent_history('09100000-0000-4000-8000-00000000000a')),
  2,
  'l''historique contient les deux décisions (accord puis retrait), jamais écrasées'
);

select is(
  (select consent from public.admin_list_marketing_consent_history('09100000-0000-4000-8000-00000000000a') limit 1),
  false,
  'la décision la plus récente de l''historique est le retrait'
);

reset role;
select throws_ok(
  $$update public.organization_marketing_consent_events set consent = true where organization_id = '09100000-0000-4000-8000-00000000000a'$$,
  '42501', null,
  'une décision de consentement ne peut jamais être modifiée, même par le propriétaire des tables'
);
select throws_ok(
  $$delete from public.organization_marketing_consent_events where organization_id = '09100000-0000-4000-8000-00000000000a'$$,
  '42501', null,
  'une décision de consentement ne peut jamais être supprimée'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '09000000-0000-4000-8000-000000000001', true);

-- Deux assertions distinctes plutôt qu'un tuple stringifié : `is()` ne sait
-- pas comparer un type composite anonyme (row(...)) directement à un texte.
select is(
  (select marketing_consent from public.admin_list_commercial_contacts_for_export() where organization_name = 'REVENUE-01I Org A'),
  false,
  'après désabonnement : marketing_consent=false'
);

select is(
  (select unsubscribed_at is not null from public.admin_list_commercial_contacts_for_export() where organization_name = 'REVENUE-01I Org A'),
  true,
  'après désabonnement : unsubscribed_at est renseigné'
);

-- ---------------------------------------------------------------------------
-- 4. Lecture Admin (console + export) et sécurité
-- ---------------------------------------------------------------------------

select is(
  (select owner_email from public.admin_list_commercial_contacts_for_export() where organization_name = 'REVENUE-01I Org A'),
  'owner-ri01@kjora.test',
  'le courriel du propriétaire est bien dérivé (jamais stocké dans la fiche contact)'
);

select set_config('request.jwt.claim.sub', '09000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.admin_list_commercial_contacts(25, 0, null)$$,
  '42501', null,
  'un Owner (non platform_admin) ne peut pas lister les contacts commerciaux'
);

select * from finish();
rollback;
