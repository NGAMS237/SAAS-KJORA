begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select ok(not has_table_privilege('anon', 'public.tenants', 'select'),
  'anon has no table-wide tenant read');
select ok(not exists (
  select 1 from pg_catalog.pg_roles where rolname = 'platform_admin'
), 'platform_admin has no direct database role or tenant-table bypass');
select ok(not has_table_privilege('authenticated', 'public.tenants', 'select'),
  'authenticated has no table-wide tenant read');
select ok(has_column_privilege('authenticated', 'public.tenants', 'full_name', 'select'),
  'authenticated retains the minimal display projection');
select ok(not has_column_privilege('authenticated', 'public.tenants', 'email', 'select'),
  'authenticated cannot directly read private contact data');
select ok(not has_column_privilege('authenticated', 'public.tenants', 'identity_document_number', 'select'),
  'authenticated cannot directly read identity data');
select is((
  select count(*)
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join lateral pg_catalog.aclexplode(
    coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
  ) acl
  where n.nspname = 'public'
    and p.proname in (
      'list_tenant_document_contacts',
      'list_tenants_for_import',
      'list_tenants_for_export'
    )
    and acl.grantee = 0
    and acl.privilege_type = 'EXECUTE'
), 0::bigint, 'no new SECURITY DEFINER projection is executable by PUBLIC');

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('19000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'security-owner-a@kjora.test', now(), now(), now()),
  ('19000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'security-owner-b@kjora.test', now(), now(), now()),
  ('19000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'security-viewer-a@kjora.test', now(), now(), now()),
  ('19000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'security-portal@kjora.test', now(), now(), now());

insert into public.organizations (id, created_by) values
  ('29000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001'),
  ('29000000-0000-4000-8000-00000000000b', '19000000-0000-4000-8000-000000000002');
insert into public.organization_profiles (organization_id, name) values
  ('29000000-0000-4000-8000-00000000000a', 'Security Org A'),
  ('29000000-0000-4000-8000-00000000000b', 'Security Org B');
insert into public.memberships (organization_id, user_id, role) values
  ('29000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001', 'organization_owner'),
  ('29000000-0000-4000-8000-00000000000b', '19000000-0000-4000-8000-000000000002', 'organization_owner'),
  ('29000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000003', 'viewer');
insert into public.organization_plans (organization_id, plan) values
  ('29000000-0000-4000-8000-00000000000a', 'avance'),
  ('29000000-0000-4000-8000-00000000000b', 'avance')
on conflict (organization_id) do update set plan = excluded.plan;
insert into public.tenants (id, organization_id, full_name, phone, email, preferred_language, created_by) values
  ('59000000-0000-4000-8000-00000000000a', '29000000-0000-4000-8000-00000000000a', 'Security Tenant A', '+237600000001', 'tenant-a@kjora.test', 'fr', '19000000-0000-4000-8000-000000000001'),
  ('59000000-0000-4000-8000-00000000000b', '29000000-0000-4000-8000-00000000000b', 'Security Tenant B', '+237600000002', 'tenant-b@kjora.test', 'en', '19000000-0000-4000-8000-000000000002');

set local role anon;
select throws_ok($$ select full_name from public.tenants $$, '42501', null,
  'anon direct tenant read is denied');
select throws_ok($$ select * from public.list_tenant_profiles('29000000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'anon cannot execute legacy tenant projection');
select throws_ok($$ select * from public.list_tenants_for_import('29000000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'anon cannot execute private import projection');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.tenants), 1::bigint,
  'Owner sees only the minimal rows of its organization');
select throws_ok($$ select email from public.tenants $$, '42501', null,
  'Owner cannot directly read private tenant contact data');
select is((select count(*) from public.list_tenants_for_import('29000000-0000-4000-8000-00000000000a')), 1::bigint,
  'authorized import receives its controlled tenant projection');
select is((select count(*) from public.list_tenants_for_export('29000000-0000-4000-8000-00000000000a')), 1::bigint,
  'authorized export with entitlement receives its controlled projection');
select is((select count(*) from public.list_tenant_document_contacts('29000000-0000-4000-8000-00000000000a', array['59000000-0000-4000-8000-00000000000a']::uuid[]) where email is not null), 1::bigint,
  'authorized document sharing receives the contact projection');
select is((select count(*) from public.list_tenants_for_import('29000000-0000-4000-8000-00000000000b')), 0::bigint,
  'Owner cannot use import projection across organizations');
select is((select count(*) from public.get_tenant_private_profile('59000000-0000-4000-8000-00000000000b')), 0::bigint,
  'legacy private profile RPC remains organization-isolated');

select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.tenants), 1::bigint,
  'authorized viewer retains the minimal tenant list');
select is((select count(*) from public.list_tenants_for_import('29000000-0000-4000-8000-00000000000a')), 0::bigint,
  'viewer without import capability receives no private projection');
select is((select count(*) from public.list_tenants_for_export('29000000-0000-4000-8000-00000000000a')), 0::bigint,
  'viewer without export capability receives no private projection');
select is((select count(*) from public.list_tenant_document_contacts('29000000-0000-4000-8000-00000000000a', array['59000000-0000-4000-8000-00000000000a']::uuid[]) where email is not null), 0::bigint,
  'viewer without sharing capability receives no contact value');

select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.tenants), 0::bigint,
  'tenant portal identity has no administrative table access');
select is((select count(*) from public.list_tenant_document_contacts('29000000-0000-4000-8000-00000000000a', array['59000000-0000-4000-8000-00000000000a']::uuid[])), 0::bigint,
  'tenant portal identity cannot use administrative contact projection');
reset role;

set local role service_role;
select is((select count(*) from public.tenants where id in
  ('59000000-0000-4000-8000-00000000000a', '59000000-0000-4000-8000-00000000000b')), 2::bigint,
  'service role retains its explicit trusted-server access');
reset role;

do $$
declare diagnostics text;
begin
  select string_agg(result, E'\n') into diagnostics from extensions.finish() as result;
  if diagnostics is not null then raise exception 'SECURITY-TENANTS-ACCESS-01 pgTAP failures: %', diagnostics; end if;
end;
$$;
select 'security_tenants_access_ok' as result;
rollback;
