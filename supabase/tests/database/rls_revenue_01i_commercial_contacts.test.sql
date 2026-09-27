begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- =============================================================================
-- REVENUE-LAUNCH-01 — Sous-lot 01I — Tests RLS/RPC exécutables
-- =============================================================================
-- Même convention que rls_revenue_01h_admin_lifecycle.test.sql : transaction
-- annulée (rollback), rien ne survit.
--
-- N'A PAS ÉTÉ EXÉCUTÉ dans cette session (aucune base Postgres/Supabase
-- éphémère disponible, aucune migration distante autorisée ce tour-ci).
-- `select plan(16)` est vérifié statiquement contre le nombre réel
-- d'assertions ci-dessous, mais ce fichier n'est PAS déclaré PASS.
--
-- Isolation des identifiants : préfixe `ri` (Revenue 01I), réservé à ce
-- fichier.
-- =============================================================================

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('ri000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-ri01@kjora.test', now(), now(), now()),
  ('ri000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-ri01@kjora.test', now(), now(), now());

insert into public.platform_admins (user_id) values ('ri000000-0000-4000-8000-000000000001');

insert into public.organizations (id, created_by, status) values
  ('ri100000-0000-4000-8000-00000000000a', 'ri000000-0000-4000-8000-000000000002', 'active');

insert into public.organization_profiles (organization_id, name) values
  ('ri100000-0000-4000-8000-00000000000a', 'REVENUE-01I Org A');

insert into public.memberships (organization_id, user_id, role, status) values
  ('ri100000-0000-4000-8000-00000000000a', 'ri000000-0000-4000-8000-000000000002', 'organization_owner', 'active');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ri000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 1. Consentement impossible avant qu'une fiche contact existe
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_set_marketing_consent('ri100000-0000-4000-8000-00000000000a', true, 'admin_manual_entry') ->> 'outcome'),
  'contact_not_found',
  'admin_set_marketing_consent refuse tant qu''aucune fiche contact n''existe'
);

-- ---------------------------------------------------------------------------
-- 2. Créer / mettre à jour la fiche contact — validations
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_upsert_organization_contact('ri100000-0000-4000-8000-00000000000a', null, '', 'fr') ->> 'outcome'),
  'country_required',
  'le pays est obligatoire'
);

select is(
  (select public.admin_upsert_organization_contact('ri100000-0000-4000-8000-00000000000a', null, 'Canada', 'de') ->> 'outcome'),
  'invalid_language',
  'la langue doit être fr ou en'
);

select is(
  (select public.admin_upsert_organization_contact('ri100000-0000-4000-8000-00000000000a', '12', 'Canada', 'fr') ->> 'outcome'),
  'invalid_phone',
  'un téléphone trop court est refusé'
);

select is(
  (select public.admin_upsert_organization_contact('ri100000-0000-4000-8000-00000000000a', '+1 514 555 0100', 'Canada', 'fr') ->> 'outcome'),
  'saved',
  'admin_upsert_organization_contact enregistre une fiche valide'
);

select is(
  (select country from public.organization_commercial_contacts where organization_id = 'ri100000-0000-4000-8000-00000000000a'),
  'Canada',
  'le pays est bien enregistré, distinct de organization_profiles.country_code (verrouillé à CM)'
);

-- Idempotence de l'upsert : une seconde saisie met à jour, ne duplique jamais.
select is(
  (select public.admin_upsert_organization_contact('ri100000-0000-4000-8000-00000000000a', '+1 514 555 0199', 'Canada', 'en') ->> 'outcome'),
  'saved',
  'un second appel met à jour la même fiche (upsert)'
);

select is(
  (select count(*)::int from public.organization_commercial_contacts where organization_id = 'ri100000-0000-4000-8000-00000000000a'),
  1,
  'une seule ligne existe malgré deux appels (jamais de doublon)'
);

-- ---------------------------------------------------------------------------
-- 3. Consentement — accord, source obligatoire, désabonnement, exclusivité
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_set_marketing_consent('ri100000-0000-4000-8000-00000000000a', true, 'invalid_source_value') ->> 'outcome'),
  'invalid_source',
  'une source de consentement hors liste fermée est refusée'
);

select is(
  (select public.admin_set_marketing_consent('ri100000-0000-4000-8000-00000000000a', true, 'admin_manual_entry') ->> 'outcome'),
  'consent_updated',
  'admin_set_marketing_consent enregistre un accord valide'
);

select is(
  (select marketing_consent from public.organization_commercial_contacts where organization_id = 'ri100000-0000-4000-8000-00000000000a'),
  true,
  'marketing_consent passe bien à true'
);

select is(
  (select marketing_consent_at is not null from public.organization_commercial_contacts where organization_id = 'ri100000-0000-4000-8000-00000000000a'),
  true,
  'marketing_consent_at est bien horodaté'
);

select is(
  (select public.admin_set_marketing_consent('ri100000-0000-4000-8000-00000000000a', false, 'admin_manual_entry') ->> 'outcome'),
  'consent_updated',
  'admin_set_marketing_consent enregistre un désabonnement'
);

select is(
  (select (marketing_consent, unsubscribed_at is not null) from public.organization_commercial_contacts where organization_id = 'ri100000-0000-4000-8000-00000000000a'),
  '(f,t)',
  'après désabonnement : marketing_consent=false ET unsubscribed_at renseigné'
);

-- ---------------------------------------------------------------------------
-- 4. Lecture Admin (console + export) et sécurité
-- ---------------------------------------------------------------------------

select is(
  (select owner_email from public.admin_list_commercial_contacts_for_export() where organization_name = 'REVENUE-01I Org A'),
  'owner-ri01@kjora.test',
  'le courriel du propriétaire est bien dérivé (jamais stocké dans la fiche contact)'
);

select set_config('request.jwt.claim.sub', 'ri000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.admin_list_commercial_contacts(25, 0, null)$$,
  '42501', null,
  'un Owner (non platform_admin) ne peut pas lister les contacts commerciaux'
);

select * from finish();
rollback;
