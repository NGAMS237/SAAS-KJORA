begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('1e000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a-settings@kjora.test', now(), now(), now()),
  ('1e000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'manager-a-settings@kjora.test', now(), now(), now()),
  ('1e000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'owner-b-settings@kjora.test', now(), now(), now());
insert into public.organizations (id, created_by) values
  ('2e000000-0000-4000-8000-00000000000a', '1e000000-0000-4000-8000-000000000001'),
  ('2e000000-0000-4000-8000-00000000000b', '1e000000-0000-4000-8000-000000000003');
insert into public.organization_profiles (organization_id, name) values
  ('2e000000-0000-4000-8000-00000000000a', 'Org A Settings'),
  ('2e000000-0000-4000-8000-00000000000b', 'Org B Settings');
insert into public.memberships (organization_id, user_id, role) values
  ('2e000000-0000-4000-8000-00000000000a', '1e000000-0000-4000-8000-000000000001', 'organization_owner'),
  ('2e000000-0000-4000-8000-00000000000a', '1e000000-0000-4000-8000-000000000002', 'manager'),
  ('2e000000-0000-4000-8000-00000000000b', '1e000000-0000-4000-8000-000000000003', 'organization_owner');

insert into public.properties (id, organization_id, name, locality, type, created_by) values
  ('3e000000-0000-4000-8000-00000000000a', '2e000000-0000-4000-8000-00000000000a', 'Bien financier A', 'Douala', 'building', '1e000000-0000-4000-8000-000000000001');
insert into public.units (id, organization_id, property_id, label, type, created_by) values
  ('4e000000-0000-4000-8000-00000000000a', '2e000000-0000-4000-8000-00000000000a', '3e000000-0000-4000-8000-00000000000a', 'Appartement A1', 'apartment', '1e000000-0000-4000-8000-000000000001');
insert into public.tenants (id, organization_id, full_name, email, created_by) values
  ('5e000000-0000-4000-8000-00000000000a', '2e000000-0000-4000-8000-00000000000a', 'Locataire Finance Test', 'finance-settings@kjora.test', '1e000000-0000-4000-8000-000000000001');
insert into public.leases (
  id, organization_id, property_id, unit_id, tenant_id, start_date,
  base_rent_xaf, billing_frequency, due_day, created_by
) values (
  '6e000000-0000-4000-8000-00000000000a', '2e000000-0000-4000-8000-00000000000a',
  '3e000000-0000-4000-8000-00000000000a', '4e000000-0000-4000-8000-00000000000a',
  '5e000000-0000-4000-8000-00000000000a', '2026-09-01', 100000, 'monthly', 5,
  '1e000000-0000-4000-8000-000000000001'
);

select has_function('public', 'update_organization_profile_settings', array['uuid','text','text','text','text'], 'RPC settings existe');
select has_trigger('public', 'organization_profiles', 'organization_profiles_validate_timezone', 'validation timezone existe');

set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000001', true);
select lives_ok($$ select * from public.update_organization_profile_settings('2e000000-0000-4000-8000-00000000000a', 'Org A Updated', 'en', 'America/Toronto', 'XAF') $$, 'Owner A modifie ses settings');
select is((select timezone from public.organization_profiles where organization_id = '2e000000-0000-4000-8000-00000000000a'), 'America/Toronto', 'timezone IANA persisté');
select is((select currency_code from public.organization_profiles where organization_id = '2e000000-0000-4000-8000-00000000000a'), 'XAF', 'devise XAF tenant-scoped persistée');
-- AFRICA-CONTRACTS-PERFORMANCE-01 : la validation du format de devise passe
-- désormais AVANT la vérification du verrou (ordre plus sûr : une devise qui
-- n'existe dans aucun catalogue est refusée telle quelle, sans même exposer
-- si l'Organization est verrouillée ou non) — 'EUR' n'a jamais été une devise
-- supportée ; ce test vérifie donc désormais invalid_organization_currency
-- plutôt que organization_currency_locked. Le verrou lui-même (devise
-- SUPPORTÉE mais différente, après activité financière) est couvert par
-- rls_africa_contracts_performance_01_axis_a.test.sql.
select throws_ok($$ select * from public.update_organization_profile_settings('2e000000-0000-4000-8000-00000000000a', 'Org A', 'fr', 'Africa/Douala', 'EUR') $$, '22023', 'invalid_organization_currency', 'devise EUR hors catalogue toujours refusée après activité financière');
select throws_ok($$ select * from public.update_organization_profile_settings('2e000000-0000-4000-8000-00000000000b', 'Intrusion', 'fr', 'Africa/Douala', 'XAF') $$, '42501', 'forbidden', 'Owner A ne modifie pas Org B');
select throws_ok($$ select * from public.update_organization_profile_settings('2e000000-0000-4000-8000-00000000000a', 'Org A', 'fr', 'UTC+1 libre', 'XAF') $$, '22023', 'invalid_organization_settings', 'timezone invalide refusé');
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000002', true);
select throws_ok($$ select * from public.update_organization_profile_settings('2e000000-0000-4000-8000-00000000000a', 'Org A', 'fr', 'Africa/Douala', 'XAF') $$, '42501', 'forbidden', 'gestionnaire sans capability refusé');
reset role;

set local role anon;
select throws_ok($$ select * from public.update_organization_profile_settings('2e000000-0000-4000-8000-00000000000a', 'Org A', 'fr', 'Africa/Douala', 'XAF') $$, '42501', 'permission denied for function update_organization_profile_settings', 'anon exclu');
reset role;

select is((select count(*) from public.organization_profiles where organization_id = '2e000000-0000-4000-8000-00000000000b' and name = 'Org B Settings'), 1::bigint, 'Org B intacte');
select * from extensions.finish();
rollback;
