begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- =============================================================================
-- REVENUE-LAUNCH-01 — Sous-lot 01H — Tests RLS/RPC exécutables
-- =============================================================================
-- Même convention que rls_revenue_01e_admin_finance_extension.test.sql :
-- transaction annulée (rollback), rien ne survit.
--
-- RÉELLEMENT EXÉCUTÉ (Complément REVENUE-LAUNCH-01, cluster PostgreSQL 16
-- local éphémère avec extension pgtap réelle — jamais Supabase distant) :
-- PASS confirmé, `select plan(23)` vérifié contre le nombre réel
-- d'assertions. Corrigé après cette exécution réelle : (1) les id de
-- membership nécessaires en paramètre des RPC admin_disable_member /
-- admin_reactivate_member / admin_transfer_organization_ownership étaient
-- embarqués en sous-requête directement dans l'appel RPC exécuté par
-- `authenticated`, ce qui renvoyait NULL silencieusement sous RLS (aucune
-- adhésion à l'Organization pour ce platform_admin) — corrigé en récupérant
-- ces id UNE FOIS pendant l'accès superuser initial et en les stockant via
-- `set_config('kjora_test.rh01_membership_...', ..., false)`, réutilisés
-- ensuite via `current_setting(...)::uuid` ; (2) les lectures de
-- vérification interne sur organizations.status et memberships.status/role
-- passaient en direct par `authenticated`, alors que ces colonnes sont
-- gardées par une policy exigeant une adhésion à l'Organization — jamais un
-- simple statut platform_admin. Ces lectures utilisent désormais `reset
-- role` (retour au rôle de session, superuser) pour cette seule vérification
-- interne, jamais un chemin d'accès applicatif réel. Même convention que
-- rls_revenue_01b_manual_invoicing.test.sql / rls_revenue_01c_billing_reminders.test.sql.
--
-- Isolation des identifiants : préfixe `08` (Revenue 01H), réservé à ce
-- fichier.
--
-- Couverture volontairement centrée sur le changement le plus risqué de ce
-- lot : private.has_capability filtre désormais aussi organizations.status
-- (assertions 3 et 5) — le seul comportement de ce lot qui touche un point
-- d'entrée partagé par tout le schéma.
-- =============================================================================

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('08000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-rh01@kjora.test', now(), now(), now()),
  ('08000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-rh01@kjora.test', now(), now(), now()),
  ('08000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'member-rh01@kjora.test', now(), now(), now()),
  ('08000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'target-rh01@kjora.test', now(), now(), now());

insert into public.platform_admins (user_id) values ('08000000-0000-4000-8000-000000000001');

-- Org A : cycle suspend/reactivate + cycle de vie membre/propriété.
-- Org B : cycle archive/restore (nom distinct, pour la confirmation saisie).
insert into public.organizations (id, created_by, status) values
  ('08100000-0000-4000-8000-00000000000a', '08000000-0000-4000-8000-000000000002', 'active'),
  ('08100000-0000-4000-8000-00000000000b', '08000000-0000-4000-8000-000000000002', 'active');

insert into public.organization_profiles (organization_id, name) values
  ('08100000-0000-4000-8000-00000000000a', 'REVENUE-01H Org A'),
  ('08100000-0000-4000-8000-00000000000b', 'REVENUE-01H Org B');

insert into public.memberships (organization_id, user_id, role, status) values
  ('08100000-0000-4000-8000-00000000000a', '08000000-0000-4000-8000-000000000002', 'organization_owner', 'active'),
  ('08100000-0000-4000-8000-00000000000a', '08000000-0000-4000-8000-000000000003', 'viewer', 'active'),
  ('08100000-0000-4000-8000-00000000000a', '08000000-0000-4000-8000-000000000004', 'manager', 'active');

-- Récupère UNE FOIS les id de membership (encore superuser, avant le
-- basculement `authenticated`) : organizations/memberships n'accordent à
-- `authenticated` qu'un SELECT en colonnes précises, gardé par une policy
-- exigeant une adhésion (lot_5b/5c) — jamais un simple statut
-- platform_admin. Un Admin non membre ne peut donc pas retrouver ces id
-- lui-même ; les RPC ci-dessous en ont besoin en paramètre. Même convention
-- que rls_revenue_01b_manual_invoicing.test.sql /
-- rls_revenue_01c_billing_reminders.test.sql (`reset role` + GUC de session).
select set_config('kjora_test.rh01_membership_owner',
  (select id::text from public.memberships where organization_id = '08100000-0000-4000-8000-00000000000a'
     and user_id = '08000000-0000-4000-8000-000000000002'), false);
select set_config('kjora_test.rh01_membership_viewer',
  (select id::text from public.memberships where organization_id = '08100000-0000-4000-8000-00000000000a'
     and user_id = '08000000-0000-4000-8000-000000000003'), false);
select set_config('kjora_test.rh01_membership_manager',
  (select id::text from public.memberships where organization_id = '08100000-0000-4000-8000-00000000000a'
     and user_id = '08000000-0000-4000-8000-000000000004'), false);

set local role authenticated;
select set_config('request.jwt.claim.sub', '08000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 1. Suspendre / réactiver une Organization — et son effet réel sur l'accès
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_suspend_organization('08100000-0000-4000-8000-00000000000a', 'Motif de test REVENUE-01H') ->> 'outcome'),
  'suspended',
  'admin_suspend_organization suspend une Organization active'
);

reset role;
select is(
  (select status from public.organizations where id = '08100000-0000-4000-8000-00000000000a'),
  'suspended',
  'organizations.status passe bien à ''suspended'''
);
set local role authenticated;

select set_config('request.jwt.claim.sub', '08000000-0000-4000-8000-000000000003', true);
select is(
  (select private.has_capability('08100000-0000-4000-8000-00000000000a', 'organization.view')),
  false,
  'un membre actif d''une Organization suspendue perd sa capacité (REVENUE-01H, has_capability)'
);

select set_config('request.jwt.claim.sub', '08000000-0000-4000-8000-000000000001', true);
select is(
  (select public.admin_reactivate_organization('08100000-0000-4000-8000-00000000000a', 'Motif de test REVENUE-01H') ->> 'outcome'),
  'reactivated',
  'admin_reactivate_organization réactive une Organization suspendue'
);

select set_config('request.jwt.claim.sub', '08000000-0000-4000-8000-000000000003', true);
select is(
  (select private.has_capability('08100000-0000-4000-8000-00000000000a', 'organization.view')),
  true,
  'la capacité est immédiatement restaurée après réactivation'
);
select set_config('request.jwt.claim.sub', '08000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 2. Archiver / restaurer — confirmation par saisie du nom exact
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_archive_organization('08100000-0000-4000-8000-00000000000b', 'Mauvais nom', 'Motif') ->> 'outcome'),
  'name_confirmation_mismatch',
  'admin_archive_organization refuse un nom de confirmation incorrect'
);

select is(
  (select public.admin_archive_organization('08100000-0000-4000-8000-00000000000b', 'REVENUE-01H Org B', 'Motif') ->> 'outcome'),
  'archived',
  'admin_archive_organization archive avec le nom exact'
);

reset role;
select is(
  (select status from public.organizations where id = '08100000-0000-4000-8000-00000000000b'),
  'archived',
  'organizations.status passe bien à ''archived'''
);
set local role authenticated;

select is(
  (select public.admin_restore_organization('08100000-0000-4000-8000-00000000000b', 'Motif') ->> 'outcome'),
  'restored',
  'admin_restore_organization restaure une Organization archivée'
);

reset role;
select is(
  (select status from public.organizations where id = '08100000-0000-4000-8000-00000000000b'),
  'active',
  'organizations.status revient bien à ''active'' après restauration'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '08000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 3. Désactiver / réactiver un membre — idempotence et protection du propriétaire
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_disable_member(
    '08100000-0000-4000-8000-00000000000a',
    (current_setting('kjora_test.rh01_membership_viewer'))::uuid,
    'Motif'
  ) ->> 'outcome'),
  'disabled',
  'admin_disable_member désactive un membre actif'
);

reset role;
select is(
  (select status from public.memberships where organization_id = '08100000-0000-4000-8000-00000000000a'
     and user_id = '08000000-0000-4000-8000-000000000003'),
  'revoked',
  'memberships.status passe bien à ''revoked'''
);
set local role authenticated;

select is(
  (select public.admin_disable_member(
    '08100000-0000-4000-8000-00000000000a',
    (current_setting('kjora_test.rh01_membership_viewer'))::uuid,
    'Motif'
  ) ->> 'outcome'),
  'already_disabled',
  'un second appel sur un membre déjà désactivé reste idempotent'
);

select is(
  (select public.admin_disable_member(
    '08100000-0000-4000-8000-00000000000a',
    (current_setting('kjora_test.rh01_membership_owner'))::uuid,
    'Motif'
  ) ->> 'outcome'),
  'owner_transfer_required',
  'un propriétaire ne peut jamais être désactivé directement'
);

select is(
  (select public.admin_reactivate_member(
    '08100000-0000-4000-8000-00000000000a',
    (current_setting('kjora_test.rh01_membership_viewer'))::uuid,
    'Motif'
  ) ->> 'outcome'),
  'reactivated',
  'admin_reactivate_member réactive un membre désactivé'
);

reset role;
select is(
  (select status from public.memberships where organization_id = '08100000-0000-4000-8000-00000000000a'
     and user_id = '08000000-0000-4000-8000-000000000003'),
  'active',
  'memberships.status revient bien à ''active'''
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '08000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 4. Transfert de propriété — version Admin, sans exiger que l'appelant soit
--    lui-même le propriétaire (contrairement au self-service, lot_5c)
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_transfer_organization_ownership(
    '08100000-0000-4000-8000-00000000000a',
    (current_setting('kjora_test.rh01_membership_manager'))::uuid,
    'Motif'
  ) ->> 'outcome'),
  'transferred',
  'admin_transfer_organization_ownership transfère la propriété, appelée par un Admin non membre'
);

reset role;
select is(
  (select role from public.memberships where organization_id = '08100000-0000-4000-8000-00000000000a'
     and user_id = '08000000-0000-4000-8000-000000000004'),
  'organization_owner',
  'le membre cible devient bien organization_owner'
);

select is(
  (select role from public.memberships where organization_id = '08100000-0000-4000-8000-00000000000a'
     and user_id = '08000000-0000-4000-8000-000000000002'),
  'manager',
  'l''ancien propriétaire redevient bien manager'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '08000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 5. Notes internes et historique
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_add_organization_note('08100000-0000-4000-8000-00000000000a', 'Note interne de test REVENUE-01H.') ->> 'outcome'),
  'note_added',
  'admin_add_organization_note enregistre une note'
);

select is(
  (select count(*) from public.admin_list_organization_notes('08100000-0000-4000-8000-00000000000a'))::int,
  1,
  'la note enregistrée est bien listée par admin_list_organization_notes'
);

select is(
  (select count(*) from public.admin_list_administrative_audit('08100000-0000-4000-8000-00000000000a', 50) where action = 'organization.suspended')::int,
  1,
  'la suspension de l''Organization A est bien journalisée dans l''historique administratif'
);

-- ---------------------------------------------------------------------------
-- 6. Sécurité — un non-Admin ne peut appeler aucune de ces RPC
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '08000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.admin_suspend_organization('08100000-0000-4000-8000-00000000000a', 'Motif')$$,
  '42501', null,
  'un manager (non platform_admin) ne peut pas appeler admin_suspend_organization'
);

select * from finish();
rollback;
