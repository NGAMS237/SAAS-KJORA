begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('16000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a-6b@kjora.test', now(), now(), now()),
  ('16000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-b-6b@kjora.test', now(), now(), now()),
  ('16000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'manager-a-6b@kjora.test', now(), now(), now()),
  ('16000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'viewer-a-6b@kjora.test', now(), now(), now()),
  ('16000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'none-6b@kjora.test', now(), now(), now());

insert into public.organizations (id, created_by) values
  ('26000000-0000-4000-8000-00000000000a', '16000000-0000-4000-8000-000000000001'),
  ('26000000-0000-4000-8000-00000000000b', '16000000-0000-4000-8000-000000000002');
insert into public.organization_profiles (organization_id, name) values
  ('26000000-0000-4000-8000-00000000000a', 'Org A Lot 6B'),
  ('26000000-0000-4000-8000-00000000000b', 'Org B Lot 6B');
insert into public.memberships (organization_id, user_id, role) values
  ('26000000-0000-4000-8000-00000000000a', '16000000-0000-4000-8000-000000000001', 'organization_owner'),
  ('26000000-0000-4000-8000-00000000000b', '16000000-0000-4000-8000-000000000002', 'organization_owner'),
  ('26000000-0000-4000-8000-00000000000a', '16000000-0000-4000-8000-000000000003', 'manager'),
  ('26000000-0000-4000-8000-00000000000a', '16000000-0000-4000-8000-000000000004', 'viewer');

insert into public.properties (id, organization_id, name, locality, type, created_by) values
  ('36000000-0000-4000-8000-00000000000a', '26000000-0000-4000-8000-00000000000a', 'Immeuble A 6B', 'Douala', 'building', '16000000-0000-4000-8000-000000000001'),
  ('36000000-0000-4000-8000-00000000000b', '26000000-0000-4000-8000-00000000000b', 'Immeuble B 6B', 'Yaoundé', 'building', '16000000-0000-4000-8000-000000000002');
insert into public.units (id, organization_id, property_id, label, type, created_by) values
  ('46000000-0000-4000-8000-00000000000a', '26000000-0000-4000-8000-00000000000a', '36000000-0000-4000-8000-00000000000a', 'A1', 'apartment', '16000000-0000-4000-8000-000000000001'),
  ('46000000-0000-4000-8000-00000000000c', '26000000-0000-4000-8000-00000000000a', '36000000-0000-4000-8000-00000000000a', 'Chambre A2', 'room', '16000000-0000-4000-8000-000000000001'),
  ('46000000-0000-4000-8000-00000000000b', '26000000-0000-4000-8000-00000000000b', '36000000-0000-4000-8000-00000000000b', 'B1', 'studio', '16000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);

select lives_ok($$
  insert into public.tenants (id, organization_id, full_name, phone, created_by)
  values ('56000000-0000-4000-8000-00000000000a', '26000000-0000-4000-8000-00000000000a', 'Téléphone Seulement', '+237699000001', '16000000-0000-4000-8000-000000000001')
$$, 'Owner crée un Tenant avec téléphone seulement');
select lives_ok($$
  insert into public.tenants (id, organization_id, full_name, email, identity_document_type, identity_document_number, created_by)
  values ('56000000-0000-4000-8000-00000000000c', '26000000-0000-4000-8000-00000000000a', 'Email Seulement', 'email@kjora.test', 'cni', 'CNI-001', '16000000-0000-4000-8000-000000000001')
$$, 'Owner crée un Tenant avec email seulement');
select throws_ok($$
  insert into public.tenants (organization_id, full_name, created_by)
  values ('26000000-0000-4000-8000-00000000000a', 'Sans Contact', '16000000-0000-4000-8000-000000000001')
$$, '23514', null, 'Tenant sans téléphone ni email refusé');
select throws_ok($$
  insert into public.tenants (organization_id, full_name, phone, identity_document_type, created_by)
  values ('26000000-0000-4000-8000-00000000000a', 'Pièce Incomplète', '+237699000002', 'cni', '16000000-0000-4000-8000-000000000001')
$$, '23514', null, 'métadonnées identité incomplètes refusées');
select lives_ok($$
  update public.tenants set profession = 'Commerçante', internal_notes = 'Contact matin' where id = '56000000-0000-4000-8000-00000000000a'
$$, 'Owner modifie le dossier Tenant');
select is((select count(*) from public.tenants), 2::bigint, 'Owner A voit ses deux Tenants');
select throws_ok($$
  select identity_document_number from public.tenants where id = '56000000-0000-4000-8000-00000000000c'
$$, '42501', null, 'champ identité privé indisponible en lecture directe');
select throws_ok($$
  select phone from public.tenants where id = '56000000-0000-4000-8000-00000000000c'
$$, '42501', null, 'contact personnel indisponible en lecture directe');
select is((select count(*) from public.get_tenant_private_profile('56000000-0000-4000-8000-00000000000c')), 1::bigint, 'Owner obtient la projection privée autorisée');

select lives_ok($$
  insert into public.leases (
    id, organization_id, property_id, unit_id, tenant_id, start_date, end_date,
    base_rent_xaf, recurring_charges_xaf, security_deposit_xaf,
    initial_prepayment_periods, initial_prepayment_amount_xaf,
    billing_frequency, due_day, generate_due_days_before, overdue_reminder_days_after,
    entry_proration_mode, exit_proration_mode, created_by
  ) values (
    '66000000-0000-4000-8000-00000000000a', '26000000-0000-4000-8000-00000000000a',
    '36000000-0000-4000-8000-00000000000a', '46000000-0000-4000-8000-00000000000a',
    '56000000-0000-4000-8000-00000000000a', '2026-09-01', '2026-09-30',
    200000, 25000, 200000, 1, 225000, 'monthly', 5, 5, 1,
    'calendar_days', 'calendar_days', '16000000-0000-4000-8000-000000000001'
  )
$$, 'Owner crée un Lease brouillon complet');
select is((select status from public.leases where id = '66000000-0000-4000-8000-00000000000a'), 'draft', 'Lease commence en brouillon');
select is((select periodic_total_xaf from public.leases where id = '66000000-0000-4000-8000-00000000000a'), 225000::bigint, 'total périodique est dérivé');
select is((select count(*) from public.leases where unit_id = '46000000-0000-4000-8000-00000000000a' and status = 'active'), 0::bigint, 'brouillon ne rend pas Unit occupée');
select lives_ok($$
  update public.leases set status = 'active' where id = '66000000-0000-4000-8000-00000000000a'
$$, 'activation explicite réussit');
select is((select count(*) from public.leases where unit_id = '46000000-0000-4000-8000-00000000000a' and status = 'active'), 1::bigint, 'occupation dérive du Lease actif');
reset role;
select is((select count(*) from private.domain_events where event_type = 'LEASE_ACTIVATED' and aggregate_id = '66000000-0000-4000-8000-00000000000a'), 1::bigint, 'LEASE_ACTIVATED unique');
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);

insert into public.leases (id, organization_id, property_id, unit_id, tenant_id, start_date, end_date, base_rent_xaf, billing_frequency, due_day, created_by) values
  ('66000000-0000-4000-8000-00000000000b', '26000000-0000-4000-8000-00000000000a', '36000000-0000-4000-8000-00000000000a', '46000000-0000-4000-8000-00000000000a', '56000000-0000-4000-8000-00000000000c', '2026-09-01', '2026-09-30', 210000, 'monthly', 5, '16000000-0000-4000-8000-000000000001'),
  ('66000000-0000-4000-8000-00000000000c', '26000000-0000-4000-8000-00000000000a', '36000000-0000-4000-8000-00000000000a', '46000000-0000-4000-8000-00000000000a', '56000000-0000-4000-8000-00000000000c', '2026-09-15', '2026-10-15', 210000, 'monthly', 5, '16000000-0000-4000-8000-000000000001'),
  ('66000000-0000-4000-8000-00000000000d', '26000000-0000-4000-8000-00000000000a', '36000000-0000-4000-8000-00000000000a', '46000000-0000-4000-8000-00000000000a', '56000000-0000-4000-8000-00000000000c', '2026-08-01', '2026-10-31', 210000, 'monthly', 5, '16000000-0000-4000-8000-000000000001'),
  ('66000000-0000-4000-8000-00000000000e', '26000000-0000-4000-8000-00000000000a', '36000000-0000-4000-8000-00000000000a', '46000000-0000-4000-8000-00000000000a', '56000000-0000-4000-8000-00000000000c', '2026-10-01', '2027-09-30', 210000, 'monthly', 5, '16000000-0000-4000-8000-000000000001');
select is((select count(*) from public.leases where status = 'draft' and unit_id = '46000000-0000-4000-8000-00000000000a'), 4::bigint, 'plusieurs brouillons incompatibles restent préparables');
select throws_ok($$ update public.leases set status = 'active' where id = '66000000-0000-4000-8000-00000000000b' $$, '23P01', null, 'mêmes dates actives refusées');
select throws_ok($$ update public.leases set status = 'active' where id = '66000000-0000-4000-8000-00000000000c' $$, '23P01', null, 'chevauchement partiel actif refusé');
select throws_ok($$ update public.leases set status = 'active' where id = '66000000-0000-4000-8000-00000000000d' $$, '23P01', null, 'recouvrement total actif refusé');
select throws_ok($$ update public.units set status = 'archived' where id = '46000000-0000-4000-8000-00000000000a' $$, '23514', null, 'Unit occupée ne peut être archivée');
select throws_ok($$ update public.leases set base_rent_xaf = 1 where id = '66000000-0000-4000-8000-00000000000a' $$, '23514', null, 'conditions actives sont immuables');
select lives_ok($$ update public.leases set status = 'ended', ended_on = '2026-09-30' where id = '66000000-0000-4000-8000-00000000000a' $$, 'clôture explicite libère Unit');
select throws_ok($$ update public.leases set status = 'active' where id = '66000000-0000-4000-8000-00000000000b' $$, '23P01', null, 'historique terminé ne peut pas être recouvert sur les mêmes dates');
select lives_ok($$ update public.leases set status = 'active' where id = '66000000-0000-4000-8000-00000000000e' $$, 'bail futur après fin précédente accepté');

select throws_ok($$
  insert into public.leases (organization_id, property_id, unit_id, tenant_id, start_date, base_rent_xaf, billing_frequency, due_day, created_by)
  values ('26000000-0000-4000-8000-00000000000a', '36000000-0000-4000-8000-00000000000a', '46000000-0000-4000-8000-00000000000a', '56000000-0000-4000-8000-00000000000c', '2028-01-01', 100000, 'monthly', 5, '16000000-0000-4000-8000-000000000002')
$$, '42501', null, 'created_by étranger refusé par RLS');

select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.tenants), 2::bigint, 'consultation voit les Tenants A');
select is((select count(*) from public.leases), 5::bigint, 'consultation voit les Leases A');
select is((select count(*) from public.get_tenant_private_profile('56000000-0000-4000-8000-00000000000c')), 0::bigint, 'consultation ne reçoit pas la projection privée');
select is((select phone from public.list_tenant_profiles('26000000-0000-4000-8000-00000000000a') where tenant_id = '56000000-0000-4000-8000-00000000000a'), null, 'consultation voit identité minimale sans contact');
select results_eq($$ update public.tenants set full_name = 'Refus Viewer' returning id $$, array[]::uuid[], 'consultation ne modifie pas Tenant');
select results_eq($$ update public.leases set status = 'active' returning id $$, array[]::uuid[], 'consultation ne modifie pas Lease');

select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000005', true);
select is((select count(*) from public.tenants), 0::bigint, 'non-membre ne voit aucun Tenant');
select is((select count(*) from public.leases), 0::bigint, 'non-membre ne voit aucun Lease');

select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.tenants), 0::bigint, 'Owner B ne voit aucun Tenant A');
select is((select count(*) from public.leases), 0::bigint, 'Owner B ne voit aucun Lease A');
select throws_ok($$
  insert into public.tenants (organization_id, full_name, phone, created_by)
  values ('26000000-0000-4000-8000-00000000000a', 'Cross tenant', '+237699999999', '16000000-0000-4000-8000-000000000002')
$$, '42501', null, 'Owner B ne crée pas Tenant A');

reset role;
select hasnt_column('public', 'units', 'occupied', 'aucun booléen occupation');
select has_column('public', 'leases', 'periodic_total_xaf', 'total périodique dérivé disponible');
select is((select count(*) from private.domain_events where event_type = 'TENANT_CREATED'), 2::bigint, 'TENANT_CREATED produit une fois par Tenant');

do $$
declare diagnostics text;
begin
  select string_agg(result, E'\n') into diagnostics from extensions.finish() as result;
  if diagnostics is not null then raise exception 'Lot 6B pgTAP failures: %', diagnostics; end if;
end;
$$;
select 'lot_6b_rls_ok' as result;
rollback;
