begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- =============================================================================
-- REVENUE-LAUNCH-01 — Sous-lot 01H — Tests RLS/RPC exécutables
-- =============================================================================
-- Même convention que rls_revenue_01e_admin_finance_extension.test.sql :
-- transaction annulée (rollback), rien ne survit.
--
-- N'A PAS ÉTÉ EXÉCUTÉ dans cette session (aucune base Postgres/Supabase
-- éphémère disponible, aucune migration distante autorisée ce tour-ci).
-- `select plan(23)` est vérifié statiquement contre le nombre réel
-- d'assertions ci-dessous, mais ce fichier n'est PAS déclaré PASS.
--
-- Isolation des identifiants : préfixe `rh` (Revenue 01H), réservé à ce
-- fichier.
--
-- Couverture volontairement centrée sur le changement le plus risqué de ce
-- lot : private.has_capability filtre désormais aussi organizations.status
-- (assertions 3 et 5) — le seul comportement de ce lot qui touche un point
-- d'entrée partagé par tout le schéma.
-- =============================================================================

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('rh000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-rh01@kjora.test', now(), now(), now()),
  ('rh000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-rh01@kjora.test', now(), now(), now()),
  ('rh000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'member-rh01@kjora.test', now(), now(), now()),
  ('rh000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'target-rh01@kjora.test', now(), now(), now());

insert into public.platform_admins (user_id) values ('rh000000-0000-4000-8000-000000000001');

-- Org A : cycle suspend/reactivate + cycle de vie membre/propriété.
-- Org B : cycle archive/restore (nom distinct, pour la confirmation saisie).
insert into public.organizations (id, created_by, status) values
  ('rh100000-0000-4000-8000-00000000000a', 'rh000000-0000-4000-8000-000000000002', 'active'),
  ('rh100000-0000-4000-8000-00000000000b', 'rh000000-0000-4000-8000-000000000002', 'active');

insert into public.organization_profiles (organization_id, name) values
  ('rh100000-0000-4000-8000-00000000000a', 'REVENUE-01H Org A'),
  ('rh100000-0000-4000-8000-00000000000b', 'REVENUE-01H Org B');

insert into public.memberships (organization_id, user_id, role, status) values
  ('rh100000-0000-4000-8000-00000000000a', 'rh000000-0000-4000-8000-000000000002', 'organization_owner', 'active'),
  ('rh100000-0000-4000-8000-00000000000a', 'rh000000-0000-4000-8000-000000000003', 'viewer', 'active'),
  ('rh100000-0000-4000-8000-00000000000a', 'rh000000-0000-4000-8000-000000000004', 'manager', 'active');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'rh000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 1. Suspendre / réactiver une Organization — et son effet réel sur l'accès
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_suspend_organization('rh100000-0000-4000-8000-00000000000a', 'Motif de test REVENUE-01H') ->> 'outcome'),
  'suspended',
  'admin_suspend_organization suspend une Organization active'
);

select is(
  (select status from public.organizations where id = 'rh100000-0000-4000-8000-00000000000a'),
  'suspended',
  'organizations.status passe bien à ''suspended'''
);

select set_config('request.jwt.claim.sub', 'rh000000-0000-4000-8000-000000000003', true);
select is(
  (select private.has_capability('rh100000-0000-4000-8000-00000000000a', 'organization.view')),
  false,
  'un membre actif d''une Organization suspendue perd sa capacité (REVENUE-01H, has_capability)'
);

select set_config('request.jwt.claim.sub', 'rh000000-0000-4000-8000-000000000001', true);
select is(
  (select public.admin_reactivate_organization('rh100000-0000-4000-8000-00000000000a', 'Motif de test REVENUE-01H') ->> 'outcome'),
  'reactivated',
  'admin_reactivate_organization réactive une Organization suspendue'
);

select set_config('request.jwt.claim.sub', 'rh000000-0000-4000-8000-000000000003', true);
select is(
  (select private.has_capability('rh100000-0000-4000-8000-00000000000a', 'organization.view')),
  true,
  'la capacité est immédiatement restaurée après réactivation'
);
select set_config('request.jwt.claim.sub', 'rh000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 2. Archiver / restaurer — confirmation par saisie du nom exact
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_archive_organization('rh100000-0000-4000-8000-00000000000b', 'Mauvais nom', 'Motif') ->> 'outcome'),
  'name_confirmation_mismatch',
  'admin_archive_organization refuse un nom de confirmation incorrect'
);

select is(
  (select public.admin_archive_organization('rh100000-0000-4000-8000-00000000000b', 'REVENUE-01H Org B', 'Motif') ->> 'outcome'),
  'archived',
  'admin_archive_organization archive avec le nom exact'
);

select is(
  (select status from public.organizations where id = 'rh100000-0000-4000-8000-00000000000b'),
  'archived',
  'organizations.status passe bien à ''archived'''
);

select is(
  (select public.admin_restore_organization('rh100000-0000-4000-8000-00000000000b', 'Motif') ->> 'outcome'),
  'restored',
  'admin_restore_organization restaure une Organization archivée'
);

select is(
  (select status from public.organizations where id = 'rh100000-0000-4000-8000-00000000000b'),
  'active',
  'organizations.status revient bien à ''active'' après restauration'
);

-- ---------------------------------------------------------------------------
-- 3. Désactiver / réactiver un membre — idempotence et protection du propriétaire
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_disable_member(
    'rh100000-0000-4000-8000-00000000000a',
    (select id from public.memberships where organization_id = 'rh100000-0000-4000-8000-00000000000a'
       and user_id = 'rh000000-0000-4000-8000-000000000003'),
    'Motif'
  ) ->> 'outcome'),
  'disabled',
  'admin_disable_member désactive un membre actif'
);

select is(
  (select status from public.memberships where organization_id = 'rh100000-0000-4000-8000-00000000000a'
     and user_id = 'rh000000-0000-4000-8000-000000000003'),
  'revoked',
  'memberships.status passe bien à ''revoked'''
);

select is(
  (select public.admin_disable_member(
    'rh100000-0000-4000-8000-00000000000a',
    (select id from public.memberships where organization_id = 'rh100000-0000-4000-8000-00000000000a'
       and user_id = 'rh000000-0000-4000-8000-000000000003'),
    'Motif'
  ) ->> 'outcome'),
  'already_disabled',
  'un second appel sur un membre déjà désactivé reste idempotent'
);

select is(
  (select public.admin_disable_member(
    'rh100000-0000-4000-8000-00000000000a',
    (select id from public.memberships where organization_id = 'rh100000-0000-4000-8000-00000000000a'
       and user_id = 'rh000000-0000-4000-8000-000000000002'),
    'Motif'
  ) ->> 'outcome'),
  'owner_transfer_required',
  'un propriétaire ne peut jamais être désactivé directement'
);

select is(
  (select public.admin_reactivate_member(
    'rh100000-0000-4000-8000-00000000000a',
    (select id from public.memberships where organization_id = 'rh100000-0000-4000-8000-00000000000a'
       and user_id = 'rh000000-0000-4000-8000-000000000003'),
    'Motif'
  ) ->> 'outcome'),
  'reactivated',
  'admin_reactivate_member réactive un membre désactivé'
);

select is(
  (select status from public.memberships where organization_id = 'rh100000-0000-4000-8000-00000000000a'
     and user_id = 'rh000000-0000-4000-8000-000000000003'),
  'active',
  'memberships.status revient bien à ''active'''
);

-- ---------------------------------------------------------------------------
-- 4. Transfert de propriété — version Admin, sans exiger que l'appelant soit
--    lui-même le propriétaire (contrairement au self-service, lot_5c)
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_transfer_organization_ownership(
    'rh100000-0000-4000-8000-00000000000a',
    (select id from public.memberships where organization_id = 'rh100000-0000-4000-8000-00000000000a'
       and user_id = 'rh000000-0000-4000-8000-000000000004'),
    'Motif'
  ) ->> 'outcome'),
  'transferred',
  'admin_transfer_organization_ownership transfère la propriété, appelée par un Admin non membre'
);

select is(
  (select role from public.memberships where organization_id = 'rh100000-0000-4000-8000-00000000000a'
     and user_id = 'rh000000-0000-4000-8000-000000000004'),
  'organization_owner',
  'le membre cible devient bien organization_owner'
);

select is(
  (select role from public.memberships where organization_id = 'rh100000-0000-4000-8000-00000000000a'
     and user_id = 'rh000000-0000-4000-8000-000000000002'),
  'manager',
  'l''ancien propriétaire redevient bien manager'
);

-- ---------------------------------------------------------------------------
-- 5. Notes internes et historique
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_add_organization_note('rh100000-0000-4000-8000-00000000000a', 'Note interne de test REVENUE-01H.') ->> 'outcome'),
  'note_added',
  'admin_add_organization_note enregistre une note'
);

select is(
  (select count(*) from public.admin_list_organization_notes('rh100000-0000-4000-8000-00000000000a'))::int,
  1,
  'la note enregistrée est bien listée par admin_list_organization_notes'
);

select is(
  (select count(*) from public.admin_list_administrative_audit('rh100000-0000-4000-8000-00000000000a', 50) where action = 'organization.suspended')::int,
  1,
  'la suspension de l''Organization A est bien journalisée dans l''historique administratif'
);

-- ---------------------------------------------------------------------------
-- 6. Sécurité — un non-Admin ne peut appeler aucune de ces RPC
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'rh000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.admin_suspend_organization('rh100000-0000-4000-8000-00000000000a', 'Motif')$$,
  '42501', null,
  'un manager (non platform_admin) ne peut pas appeler admin_suspend_organization'
);

select * from finish();
rollback;
