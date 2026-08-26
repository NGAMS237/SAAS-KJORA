begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'a@kjora.test', now(), now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'b@kjora.test', now(), now(), now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'ab@kjora.test', now(), now(), now()),
  ('10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'none@kjora.test', now(), now(), now());

insert into public.organizations (id, created_by) values
  ('20000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000002');
insert into public.organization_profiles (organization_id, name) values
  ('20000000-0000-4000-8000-00000000000a', 'Org A'),
  ('20000000-0000-4000-8000-00000000000b', 'Org B');
insert into public.memberships (organization_id, user_id, role) values
  ('20000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001', 'organization_owner'),
  ('20000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000002', 'organization_owner'),
  ('20000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000003', 'organization_owner'),
  ('20000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000003', 'organization_owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select results_eq('select count(id)::bigint from public.organizations', array[1::bigint], 'A voit une seule Organization');
select results_eq($$select count(id)::bigint from public.organizations where id = '20000000-0000-4000-8000-00000000000b'$$, array[0::bigint], 'A ne voit pas B');
select results_eq('select name from public.organization_profiles', array['Org A'::text], 'A voit le profil A');
select lives_ok($$update public.organization_profiles set name = 'Org A modifiée' where organization_id = '20000000-0000-4000-8000-00000000000a'$$, 'Owner A modifie son profil');
select results_eq($$update public.organization_profiles set name = 'Interdit' where organization_id = '20000000-0000-4000-8000-00000000000b' returning name$$, array[]::text[], 'Owner A ne modifie pas B');
select throws_ok($$insert into public.memberships (organization_id, user_id, role) values ('20000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000004', 'viewer')$$, '42501', null, 'Aucun ajout direct de Membership en 5B');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select results_eq('select count(id)::bigint from public.organizations', array[2::bigint], 'A+B voit exactement ses deux Organizations');
select results_eq($$select count(organization_id)::bigint from public.organization_profiles where organization_id = '20000000-0000-4000-8000-00000000000b'$$, array[1::bigint], 'le contexte B reste filtrable explicitement');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select results_eq('select count(id)::bigint from public.organizations', array[0::bigint], 'un non-membre ne voit aucune Organization');

select * from finish();
rollback;
