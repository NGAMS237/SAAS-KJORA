-- =============================================================================
-- pgTAP — AFRICA-CONTRACTS-PERFORMANCE-01 — AXE A (fondation multi-devises)
-- Transactionnel : aucun résidu en base (rollback final).
-- =============================================================================

begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a-acp01@kjora.test', now(), now(), now()),
  ('e1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'viewer-a-acp01@kjora.test', now(), now(), now()),
  ('e1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'owner-b-acp01@kjora.test', now(), now(), now()),
  ('e1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'stranger-acp01@kjora.test', now(), now(), now()),
  ('e1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'owner-c-acp01@kjora.test', now(), now(), now());

-- ---------------------------------------------------------------------------
-- 0. Vérification statique : la définition unique du verrou référence bien
--    les 6 relations attendues, explicitement — jamais une liste partielle.
-- ---------------------------------------------------------------------------
select ok(
  pg_get_functiondef('private.organization_has_financial_operations(uuid)'::regprocedure) ~ 'public\.leases',
  'organization_has_financial_operations référence leases'
);
select ok(
  pg_get_functiondef('private.organization_has_financial_operations(uuid)'::regprocedure) ~ 'public\.lease_financial_terms',
  'organization_has_financial_operations référence lease_financial_terms'
);
select ok(
  pg_get_functiondef('private.organization_has_financial_operations(uuid)'::regprocedure) ~ 'public\.dues',
  'organization_has_financial_operations référence dues'
);
select ok(
  pg_get_functiondef('private.organization_has_financial_operations(uuid)'::regprocedure) ~ 'public\.payments',
  'organization_has_financial_operations référence payments'
);
select ok(
  pg_get_functiondef('private.organization_has_financial_operations(uuid)'::regprocedure) ~ 'public\.payment_allocations',
  'organization_has_financial_operations référence payment_allocations'
);
select ok(
  pg_get_functiondef('private.organization_has_financial_operations(uuid)'::regprocedure) ~ 'public\.ledger_entries',
  'organization_has_financial_operations référence ledger_entries'
);
select ok(
  pg_get_functiondef('private.organization_has_financial_operations(uuid)'::regprocedure) !~ 'public\.units',
  'organization_has_financial_operations ne verrouille PAS sur units.reference_rent_xaf (donnée de catalogue, pas une opération)'
);

-- ---------------------------------------------------------------------------
-- 1. Structure — 6 devises, catalogue de pays.
-- ---------------------------------------------------------------------------
select col_has_check('public', 'organization_profiles', 'currency_code', 'contrainte de devise présente');
select col_has_check('public', 'organization_profiles', 'country_code', 'contrainte de pays présente');
select has_function('public', 'create_organization', array['text', 'text', 'text', 'text', 'text'], 'create_organization accepte pays/devise');
select has_function('public', 'get_organization_currency_lock', array['uuid'], 'get_organization_currency_lock exposée');
select ok(
  (select prosecdef from pg_proc where oid = 'public.get_organization_currency_lock(uuid)'::regprocedure),
  'get_organization_currency_lock est SECURITY DEFINER'
);
select ok(
  not has_function_privilege('anon', 'public.get_organization_currency_lock(uuid)', 'execute'),
  'anon ne peut pas exécuter get_organization_currency_lock'
);

-- ---------------------------------------------------------------------------
-- 2. create_organization — nouveaux pays/devises.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);

select isnt(
  (select public.create_organization('Org Kenya ACP01', 'en', 'Africa/Nairobi', 'KE', 'KES')),
  null,
  'création avec un pays/devise nouveaux (Kenya/KES) réussit'
);
-- `organizations` n'est jamais lisible directement par `authenticated`
-- (aucun grant table — uniquement via les RPC SECURITY DEFINER) : ce test
-- relit donc `organization_profiles`, seule lisible (colonnes explicitement
-- accordées, lot_5b), filtrée par son nom unique dans ce test.
select is(
  (select currency_code from public.organization_profiles where name = 'Org Kenya ACP01'),
  'KES',
  'la devise KES est bien enregistrée'
);
select is(
  (select country_code from public.organization_profiles where name = 'Org Kenya ACP01'),
  'KE',
  'le pays KE est bien enregistré'
);

select throws_ok(
  $$ select public.create_organization('Org pays invalide', 'fr', 'Africa/Douala', 'US', 'XAF') $$,
  '22023', 'invalid_organization_country',
  'un pays hors catalogue est refusé'
);
select throws_ok(
  $$ select public.create_organization('Org devise invalide', 'fr', 'Africa/Douala', 'CM', 'USD') $$,
  '22023', 'invalid_organization_currency',
  'une devise hors catalogue est refusée'
);
select is(
  (select count(*) from public.organization_profiles where name = 'Org défaut ACP01'),
  0::bigint,
  'aucune Organization "Org défaut ACP01" ne doit encore exister (sanity check du test suivant)'
);
-- Un utilisateur différent : le premier a déjà atteint son quota Découverte
-- (1 Organization) avec "Org Kenya ACP01" — sans rapport avec ce lot.
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000005', true);
select isnt((select public.create_organization('Org défaut ACP01')), null, 'création avec les seuls défauts historiques réussit toujours');
select is(
  (select country_code from public.organization_profiles where name = 'Org défaut ACP01'),
  'CM',
  'sans argument pays, le comportement historique CM est inchangé'
);
select is(
  (select currency_code from public.organization_profiles where name = 'Org défaut ACP01'),
  'XAF',
  'sans argument devise, le comportement historique XAF est inchangé'
);
reset role;

-- ---------------------------------------------------------------------------
-- 3. Verrou de devise — organisation A, progression : aucune donnée -> bail.
-- ---------------------------------------------------------------------------
insert into public.organizations (id, created_by) values
  ('e2000000-0000-4000-8000-00000000000a', 'e1000000-0000-4000-8000-000000000001');
insert into public.organization_profiles (organization_id, name) values
  ('e2000000-0000-4000-8000-00000000000a', 'Org A ACP01 (verrou)');
insert into public.memberships (organization_id, user_id, role) values
  ('e2000000-0000-4000-8000-00000000000a', 'e1000000-0000-4000-8000-000000000001', 'organization_owner'),
  ('e2000000-0000-4000-8000-00000000000a', 'e1000000-0000-4000-8000-000000000002', 'viewer');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);

select is(
  (select is_locked from public.get_organization_currency_lock('e2000000-0000-4000-8000-00000000000a')),
  false,
  'aucune opération financière : la devise n''est pas verrouillée'
);
select lives_ok(
  $$ select public.update_organization_profile_settings('e2000000-0000-4000-8000-00000000000a', 'Org A ACP01 (verrou)', 'fr', 'Africa/Douala', 'XOF') $$,
  'devise changée librement en XOF (aucune opération financière)'
);
select lives_ok(
  $$ select public.update_organization_profile_settings('e2000000-0000-4000-8000-00000000000a', 'Org A ACP01 (verrou)', 'fr', 'Africa/Douala', 'XAF') $$,
  'devise reviens à XAF librement (toujours aucune opération financière)'
);
reset role;

insert into public.properties (id, organization_id, name, locality, type, created_by) values
  ('e3000000-0000-4000-8000-00000000000a', 'e2000000-0000-4000-8000-00000000000a', 'Immeuble A ACP01', 'Douala', 'building', 'e1000000-0000-4000-8000-000000000001');
insert into public.units (id, organization_id, property_id, label, type, created_by) values
  ('e4000000-0000-4000-8000-00000000000a', 'e2000000-0000-4000-8000-00000000000a', 'e3000000-0000-4000-8000-00000000000a', 'A1', 'apartment', 'e1000000-0000-4000-8000-000000000001');
insert into public.tenants (id, organization_id, full_name, phone, created_by) values
  ('e5000000-0000-4000-8000-00000000000a', 'e2000000-0000-4000-8000-00000000000a', 'Locataire ACP01 A', '+237699300001', 'e1000000-0000-4000-8000-000000000001');
insert into public.leases (
  id, organization_id, property_id, unit_id, tenant_id, status, start_date,
  base_rent_xaf, recurring_charges_xaf, security_deposit_xaf, billing_frequency,
  due_day, generate_due_days_before, created_by
) values (
  'e6000000-0000-4000-8000-00000000000a', 'e2000000-0000-4000-8000-00000000000a', 'e3000000-0000-4000-8000-00000000000a',
  'e4000000-0000-4000-8000-00000000000a', 'e5000000-0000-4000-8000-00000000000a', 'active', '2099-01-01',
  40000, 0, 0, 'monthly', 5, 5, 'e1000000-0000-4000-8000-000000000001'
);

-- Le simple insert d'un bail déclenche déjà (trigger existant, inchangé par
-- ce lot) la création de sa ligne lease_financial_terms — donc cette seule
-- étape exerce RÉELLEMENT deux des six relations du verrou.
select ok(
  (select count(*) from public.lease_financial_terms where lease_id = 'e6000000-0000-4000-8000-00000000000a') > 0,
  'créer un bail crée bien sa ligne lease_financial_terms (comportement existant, non modifié)'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select is(
  (select is_locked from public.get_organization_currency_lock('e2000000-0000-4000-8000-00000000000a')),
  true,
  'un bail existant verrouille la devise'
);
select throws_ok(
  $$ select public.update_organization_profile_settings('e2000000-0000-4000-8000-00000000000a', 'Org A ACP01 (verrou)', 'fr', 'Africa/Douala', 'XOF') $$,
  '23514', 'organization_currency_locked',
  'changer de devise après un bail est refusé (organization_currency_locked)'
);
-- Conserver la même devise reste toujours permis (ce n'est pas un changement).
select lives_ok(
  $$ select public.update_organization_profile_settings('e2000000-0000-4000-8000-00000000000a', 'Org A ACP01 (verrou)', 'en', 'Africa/Douala', 'XAF') $$,
  'les autres réglages (langue, fuseau) restent modifiables une fois la devise verrouillée'
);
reset role;

-- ---------------------------------------------------------------------------
-- 4. Verrou de devise — organisation B, flux réel échéance -> paiement
--    (dues -> ledger_entries via trigger existant ; confirm_payment -> payments
--    + payment_allocations). Confirme les 4 relations restantes.
-- ---------------------------------------------------------------------------
insert into public.organizations (id, created_by) values
  ('e2000000-0000-4000-8000-00000000000b', 'e1000000-0000-4000-8000-000000000003');
insert into public.organization_profiles (organization_id, name) values
  ('e2000000-0000-4000-8000-00000000000b', 'Org B ACP01 (verrou)');
insert into public.memberships (organization_id, user_id, role) values
  ('e2000000-0000-4000-8000-00000000000b', 'e1000000-0000-4000-8000-000000000003', 'organization_owner');
insert into public.properties (id, organization_id, name, locality, type, created_by) values
  ('e3000000-0000-4000-8000-00000000000b', 'e2000000-0000-4000-8000-00000000000b', 'Immeuble B ACP01', 'Yaoundé', 'building', 'e1000000-0000-4000-8000-000000000003');
insert into public.units (id, organization_id, property_id, label, type, created_by) values
  ('e4000000-0000-4000-8000-00000000000b', 'e2000000-0000-4000-8000-00000000000b', 'e3000000-0000-4000-8000-00000000000b', 'B1', 'studio', 'e1000000-0000-4000-8000-000000000003');
insert into public.tenants (id, organization_id, full_name, phone, created_by) values
  ('e5000000-0000-4000-8000-00000000000b', 'e2000000-0000-4000-8000-00000000000b', 'Locataire ACP01 B', '+237699300002', 'e1000000-0000-4000-8000-000000000003');
insert into public.leases (
  id, organization_id, property_id, unit_id, tenant_id, status, start_date,
  base_rent_xaf, recurring_charges_xaf, security_deposit_xaf, billing_frequency,
  due_day, generate_due_days_before, created_by
) values (
  'e6000000-0000-4000-8000-00000000000b', 'e2000000-0000-4000-8000-00000000000b', 'e3000000-0000-4000-8000-00000000000b',
  'e4000000-0000-4000-8000-00000000000b', 'e5000000-0000-4000-8000-00000000000b', 'active', '2099-01-01',
  50000, 0, 0, 'monthly', 5, 5, 'e1000000-0000-4000-8000-000000000003'
);
insert into public.dues (
  id, organization_id, lease_id, tenant_id, kind, generation_key, reference,
  period_start, period_end, due_date, notice_date, rent_amount_xaf,
  recurring_charges_amount_xaf, deposit_amount_xaf, created_by
) values (
  'e7000000-0000-4000-8000-00000000000b', 'e2000000-0000-4000-8000-00000000000b', 'e6000000-0000-4000-8000-00000000000b',
  'e5000000-0000-4000-8000-00000000000b', 'periodic', 'acp01:period:b', 'DUE-ACP01-B',
  '2026-06-01', '2026-06-30', current_date, current_date - 5, 50000, 0, 0, 'e1000000-0000-4000-8000-000000000003'
);
select ok(
  (select count(*) from public.ledger_entries where lease_id = 'e6000000-0000-4000-8000-00000000000b') > 0,
  'créer une échéance de loyer crée bien ses lignes ledger_entries (comportement existant, non modifié)'
);

create temporary table pg_temp.acp01_payment_results (
  payment_id uuid, payment_reference text, allocated_amount_xaf bigint,
  credit_created_xaf bigint, balance_before_xaf bigint, balance_after_xaf bigint,
  payment_status text
) on commit drop;
grant all on pg_temp.acp01_payment_results to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000003', true);

select is(
  (select is_locked from public.get_organization_currency_lock('e2000000-0000-4000-8000-00000000000b')),
  true,
  'un bail + une échéance verrouillent déjà la devise, avant tout paiement'
);

insert into pg_temp.acp01_payment_results select * from public.confirm_payment(
  'e6000000-0000-4000-8000-00000000000b', 50000, current_date, 'cash', null, 'ACP01 cas B',
  'acp01-case-b-000000000001', null
);
select ok(
  (select count(*) from public.payments where lease_id = 'e6000000-0000-4000-8000-00000000000b') > 0,
  'confirm_payment crée bien une ligne payments'
);
select ok(
  (select count(*) from public.payment_allocations pa
   join public.payments p on p.id = pa.payment_id
   where p.lease_id = 'e6000000-0000-4000-8000-00000000000b') > 0,
  'confirm_payment crée bien une ligne payment_allocations'
);
select is(
  (select is_locked from public.get_organization_currency_lock('e2000000-0000-4000-8000-00000000000b')),
  true,
  'toujours verrouillé après le paiement'
);
select throws_ok(
  $$ select public.update_organization_profile_settings('e2000000-0000-4000-8000-00000000000b', 'Org B ACP01 (verrou)', 'fr', 'Africa/Douala', 'NGN') $$,
  '23514', 'organization_currency_locked',
  'changer de devise après un paiement réel est refusé'
);
reset role;

-- ---------------------------------------------------------------------------
-- 5. Autorisation — inchangée par ce lot, revérifiée.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select public.update_organization_profile_settings('e2000000-0000-4000-8000-00000000000a', 'Org A ACP01 (verrou)', 'fr', 'Africa/Douala', 'XAF') $$,
  '42501', 'forbidden',
  'un viewer (sans organization.profile.manage) ne peut pas changer les réglages'
);
select lives_ok(
  $$ select public.get_organization_currency_lock('e2000000-0000-4000-8000-00000000000a') $$,
  'un viewer (organization.view) peut lire l''état du verrou'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$ select public.get_organization_currency_lock('e2000000-0000-4000-8000-00000000000a') $$,
  '42501', 'forbidden',
  'un étranger à l''Organization ne peut pas lire l''état du verrou'
);
select throws_ok(
  $$ select public.update_organization_profile_settings('e2000000-0000-4000-8000-00000000000a', 'Org A ACP01 (verrou)', 'fr', 'Africa/Douala', 'XAF') $$,
  '42501', 'forbidden',
  'un étranger à l''Organization ne peut pas changer les réglages'
);
reset role;

-- ---------------------------------------------------------------------------
-- 6. Devise invalide refusée même sans opération financière.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.update_organization_profile_settings('e2000000-0000-4000-8000-00000000000a', 'Org A ACP01 (verrou)', 'fr', 'Africa/Douala', 'USD') $$,
  '22023', 'invalid_organization_currency',
  'une devise hors catalogue est refusée même sans verrou'
);
reset role;

select finish();
rollback;
