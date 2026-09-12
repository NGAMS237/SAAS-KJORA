begin;
delete from public.organizations
 where id in (
  'caf20000-0000-4000-8000-0000000000ca',
  'caf20000-0000-4000-8000-0000000000cc'
 );
delete from auth.users
 where id in (
  'caf10000-0000-4000-8000-000000000001',
  'caf10000-0000-4000-8000-000000000002',
  'caf10000-0000-4000-8000-000000000003'
 );
commit;
