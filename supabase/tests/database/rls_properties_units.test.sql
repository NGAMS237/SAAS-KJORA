begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('12000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a-6a@kjora.test', now(), now(), now()),
  ('12000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-b-6a@kjora.test', now(), now(), now()),
  ('12000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'manager-a-6a@kjora.test', now(), now(), now()),
  ('12000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'viewer-a-6a@kjora.test', now(), now(), now()),
  ('12000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'none-6a@kjora.test', now(), now(), now());

insert into public.organizations (id, created_by) values
  ('22000000-0000-4000-8000-00000000000a', '12000000-0000-4000-8000-000000000001'),
  ('22000000-0000-4000-8000-00000000000b', '12000000-0000-4000-8000-000000000002');
insert into public.organization_profiles (organization_id, name) values
  ('22000000-0000-4000-8000-00000000000a', 'Org A Lot 6A'),
  ('22000000-0000-4000-8000-00000000000b', 'Org B Lot 6A');
insert into public.memberships (organization_id, user_id, role) values
  ('22000000-0000-4000-8000-00000000000a', '12000000-0000-4000-8000-000000000001', 'organization_owner'),
  ('22000000-0000-4000-8000-00000000000b', '12000000-0000-4000-8000-000000000002', 'organization_owner'),
  ('22000000-0000-4000-8000-00000000000a', '12000000-0000-4000-8000-000000000003', 'manager'),
  ('22000000-0000-4000-8000-00000000000a', '12000000-0000-4000-8000-000000000004', 'viewer');

-- This RLS/hierarchy fixture needs multiple properties and must test
-- cross-tenant denial before unrelated plan quotas. Rolled back below.
update public.organization_plans set plan = 'sur_mesure'
 where organization_id in (
   '22000000-0000-4000-8000-00000000000a',
   '22000000-0000-4000-8000-00000000000b'
 );

insert into public.properties (id, organization_id, name, locality, type, created_by)
values (
  '32000000-0000-4000-8000-00000000000b',
  '22000000-0000-4000-8000-00000000000b',
  'Bien B', 'Douala B', 'building',
  '12000000-0000-4000-8000-000000000002'
);
insert into public.units (id, organization_id, property_id, label, type, created_by)
values (
  '42000000-0000-4000-8000-00000000000b',
  '22000000-0000-4000-8000-00000000000b',
  '32000000-0000-4000-8000-00000000000b',
  'Unité B', 'studio',
  '12000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);

select lives_ok($$
  insert into public.properties (id, organization_id, name, locality, type, created_by)
  values ('32000000-0000-4000-8000-00000000000a', '22000000-0000-4000-8000-00000000000a', 'Maison A', 'Yaoundé', 'house', '12000000-0000-4000-8000-000000000001')
$$, 'Owner A crée une maison');
select is((select count(*) from public.properties where id = '32000000-0000-4000-8000-00000000000a'), 1::bigint, 'la maison A est lisible');
select is((select count(*) from public.units where property_id = '32000000-0000-4000-8000-00000000000a' and type = 'whole_house'), 1::bigint, 'Maison entière est créée automatiquement');
reset role;
select is((select count(*) from private.domain_events where aggregate_id = '32000000-0000-4000-8000-00000000000a' and event_type = 'PROPERTY_CREATED'), 1::bigint, 'PROPERTY_CREATED est produit une fois');
select is((select organization_id from private.domain_events where aggregate_id = '32000000-0000-4000-8000-00000000000a'), '22000000-0000-4000-8000-00000000000a'::uuid, 'event porte organization_id A');
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);

select lives_ok($$
  insert into public.properties (id, organization_id, name, locality, type, created_by)
  values ('32000000-0000-4000-8000-00000000000c', '22000000-0000-4000-8000-00000000000a', 'Immeuble A', 'Douala', 'building', '12000000-0000-4000-8000-000000000001')
$$, 'Owner A crée un immeuble');
select lives_ok($$
  insert into public.units (id, organization_id, property_id, label, type, created_by)
  values ('42000000-0000-4000-8000-00000000000a', '22000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-00000000000c', 'Appartement A1', 'apartment', '12000000-0000-4000-8000-000000000001')
$$, 'Owner ajoute un appartement');
select lives_ok($$
  insert into public.units (id, organization_id, property_id, label, type, area_sqm, created_by)
  values ('42000000-0000-4000-8000-00000000000c', '22000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-00000000000c', 'Chambre 2', 'room', 18.5, '12000000-0000-4000-8000-000000000001')
$$, 'Owner ajoute une Chambre avec superficie');
select is((select count(*) from public.units where property_id = '32000000-0000-4000-8000-00000000000c'), 2::bigint, 'immeuble accepte plusieurs unités');
select is((select type from public.units where id = '42000000-0000-4000-8000-00000000000c'), 'room', 'type Chambre est conservé');
select is((select count(*) from public.properties), 2::bigint, 'A voit exactement ses deux biens');
select is((select count(*) from public.units), 3::bigint, 'A voit exactement ses trois unités');
select is((select count(*) from public.properties where id = '32000000-0000-4000-8000-00000000000b'), 0::bigint, 'Property B est invisible depuis A');
select is((select count(*) from public.units where id = '42000000-0000-4000-8000-00000000000b'), 0::bigint, 'Unit B est invisible depuis A');

select throws_ok($$
  insert into public.properties (organization_id, name, locality, type, created_by)
  values ('22000000-0000-4000-8000-00000000000b', 'Interdit B', 'B', 'building', '12000000-0000-4000-8000-000000000001')
$$, '42501', null, 'insert Property cross-tenant refusé');
select results_eq($$
  update public.properties set name = 'Interdit' where id = '32000000-0000-4000-8000-00000000000b' returning name
$$, array[]::text[], 'update Property B ne modifie aucune ligne');
select throws_ok($$
  delete from public.properties where id = '32000000-0000-4000-8000-00000000000b'
$$, '42501', null, 'delete Property physique refusé');
select throws_ok($$
  insert into public.units (organization_id, property_id, label, type, created_by)
  values ('22000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-00000000000b', 'Cross tenant', 'studio', '12000000-0000-4000-8000-000000000001')
$$, '23503', null, 'Unit vers Property cross-tenant impossible');
select throws_ok($$
  insert into public.units (organization_id, property_id, label, type, created_by)
  values ('22000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-00000000000a', 'Appartement interdit', 'apartment', '12000000-0000-4000-8000-000000000001')
$$, '23514', null, 'une maison refuse une Unit autre que Maison entière');
select throws_ok($$
  insert into public.units (organization_id, property_id, label, type, created_by)
  values ('22000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-00000000000c', 'Maison entière', 'whole_house', '12000000-0000-4000-8000-000000000001')
$$, '23514', null, 'un immeuble refuse Maison entière');
select throws_ok($$
  insert into public.units (organization_id, property_id, label, type, created_by)
  values ('22000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-00000000000a', 'Maison entière bis', 'whole_house', '12000000-0000-4000-8000-000000000001')
$$, '23505', null, 'Maison entière ne peut pas être dupliquée');
select throws_ok($$
  insert into public.properties (organization_id, name, locality, type, created_by)
  values ('22000000-0000-4000-8000-00000000000a', 'maison a', 'Autre', 'house', '12000000-0000-4000-8000-000000000001')
$$, '23505', null, 'un nom Property actif est unique sans tenir compte de la casse');

select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000003', true);
select lives_ok($$
  update public.properties set locality = 'Douala Akwa' where id = '32000000-0000-4000-8000-00000000000c'
$$, 'gestionnaire modifie un Property A');
select lives_ok($$
  update public.units set label = 'Appartement A01', reference_rent_xaf = 175000 where id = '42000000-0000-4000-8000-00000000000a'
$$, 'gestionnaire modifie une Unit A et son loyer de référence');
select is((select reference_rent_xaf from public.units where id = '42000000-0000-4000-8000-00000000000a'), 175000::bigint, 'loyer de référence Unit est persisté');

select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.properties), 2::bigint, 'consultation lit les Properties A');
select is((select count(*) from public.units), 3::bigint, 'consultation lit les Units A');
select results_eq($$
  update public.properties set name = 'Refus Viewer' where id = '32000000-0000-4000-8000-00000000000c' returning name
$$, array[]::text[], 'consultation ne modifie pas Property');
select results_eq($$
  update public.units set reference_rent_xaf = 1 where id = '42000000-0000-4000-8000-00000000000a' returning id
$$, array[]::uuid[], 'consultation ne modifie pas le loyer de référence Unit');
select throws_ok($$
  insert into public.properties (organization_id, name, locality, type, created_by)
  values ('22000000-0000-4000-8000-00000000000a', 'Refus', 'Douala', 'building', '12000000-0000-4000-8000-000000000004')
$$, '42501', null, 'consultation ne crée pas Property');
select throws_ok($$
  insert into public.units (organization_id, property_id, label, type, created_by)
  values ('22000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-00000000000c', 'Refus', 'studio', '12000000-0000-4000-8000-000000000004')
$$, '42501', null, 'consultation ne crée pas Unit');
select throws_ok($$
  delete from public.properties where id = '32000000-0000-4000-8000-00000000000c'
$$, '42501', null, 'consultation ne supprime pas Property');
select throws_ok($$
  delete from public.units where id = '42000000-0000-4000-8000-00000000000a'
$$, '42501', null, 'consultation ne supprime pas Unit');

select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);
select lives_ok($$
  update public.units set status = 'archived' where id = '42000000-0000-4000-8000-00000000000c'
$$, 'Owner archive une Unit');
select is((select status from public.units where id = '42000000-0000-4000-8000-00000000000c'), 'archived', 'Unit archivée reste persistée');
select lives_ok($$
  update public.properties set status = 'archived' where id = '32000000-0000-4000-8000-00000000000a'
$$, 'Owner archive une Property');
select is((select status from public.properties where id = '32000000-0000-4000-8000-00000000000a'), 'archived', 'Property archivée reste persistée');
select is((select status from public.units where property_id = '32000000-0000-4000-8000-00000000000a'), 'archived', 'archiver le Bien archive Maison entière');
select is((select count(*) from public.properties where status = 'active'), 1::bigint, 'liste active A exclut le bien archivé');
select throws_ok($$
  update public.properties set created_by = '12000000-0000-4000-8000-000000000003' where id = '32000000-0000-4000-8000-00000000000c'
$$, '42501', null, 'created_by Property ne fait pas partie des colonnes modifiables');
select throws_ok($$
  update public.units set created_by = '12000000-0000-4000-8000-000000000003' where id = '42000000-0000-4000-8000-00000000000a'
$$, '42501', null, 'created_by Unit ne fait pas partie des colonnes modifiables');
select throws_ok($$
  update public.properties set status = 'active' where id = '32000000-0000-4000-8000-00000000000a'
$$, '23514', null, 'une Property archivée ne peut pas être réactivée');
select throws_ok($$
  update public.units set status = 'active' where id = '42000000-0000-4000-8000-00000000000c'
$$, '23514', null, 'une Unit archivée ne peut pas être réactivée');

reset role;
select hasnt_column('public', 'units', 'occupied', 'aucun booléen occupation ne crée une seconde vérité');
select has_column('public', 'units', 'area_sqm', 'superficie facultative est disponible');
select has_column('public', 'units', 'reference_rent_xaf', 'loyer de référence facultatif est disponible');
select col_not_null('public', 'units', 'property_id', 'parent Property est obligatoire');
select is((select count(*) from private.domain_events where event_type = 'PROPERTY_CREATED' and organization_id in ('22000000-0000-4000-8000-00000000000a', '22000000-0000-4000-8000-00000000000b')), 3::bigint, 'un event unique existe pour chaque Property créée par le test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000005', true);
select is((select count(*) from public.properties), 0::bigint, 'non-membre ne voit aucun Property');
select is((select count(*) from public.units), 0::bigint, 'non-membre ne voit aucune Unit');

select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.properties), 1::bigint, 'Owner B voit exactement Property B');
select is((select count(*) from public.units), 1::bigint, 'Owner B voit exactement Unit B');
select results_eq($$
  update public.properties set status = 'archived' where id = '32000000-0000-4000-8000-00000000000c' returning id
$$, array[]::uuid[], 'Owner B ne peut pas archiver Property A');
select results_eq($$
  update public.units set label = 'Interdit depuis B' where id = '42000000-0000-4000-8000-00000000000a' returning id
$$, array[]::uuid[], 'Owner B ne peut pas modifier Unit A');

do $$
declare
  diagnostics text;
begin
  select string_agg(result, E'\n')
    into diagnostics
    from extensions.finish() as result;
  if diagnostics is not null then
    raise exception 'Lot 6A pgTAP failures: %', diagnostics;
  end if;
end;
$$;
select 'lot_6a_rls_ok' as result;
rollback;
