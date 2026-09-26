begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select is((select count(*)::integer from pg_catalog.pg_policy
  where polrelid = 'private.domain_events'::regclass
    and polname = 'domain events are internal only'), 1,
  'historical replay leaves exactly one domain event deny policy');
select is((select polcmd from pg_catalog.pg_policy
  where polrelid = 'private.domain_events'::regclass
    and polname = 'domain events are internal only'), 'r'::"char",
  'domain event policy applies to SELECT');
select is((select polroles from pg_catalog.pg_policy
  where polrelid = 'private.domain_events'::regclass
    and polname = 'domain events are internal only'),
  array[(select oid from pg_catalog.pg_roles where rolname = 'authenticated')],
  'domain event policy targets authenticated only');
select is((select pg_catalog.pg_get_expr(polqual, polrelid)
  from pg_catalog.pg_policy
  where polrelid = 'private.domain_events'::regclass
    and polname = 'domain events are internal only'), 'false',
  'domain event SELECT is denied unconditionally');
select ok((select polwithcheck is null from pg_catalog.pg_policy
  where polrelid = 'private.domain_events'::regclass
    and polname = 'domain events are internal only'),
  'SELECT policy has no WITH CHECK expression');
select ok((select relrowsecurity from pg_catalog.pg_class
  where oid = 'private.domain_events'::regclass),
  'domain events remain under row-level security');

select * from finish();
rollback;
