begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Contract and grants.
select has_function('public', 'preview_africa_month_end', array['uuid','date'], 'month-end preview exists with the expected signature');
select ok((select prosecdef from pg_catalog.pg_proc where oid = 'public.preview_africa_month_end(uuid,date)'::regprocedure), 'month-end preview is SECURITY DEFINER');
select ok((select 'search_path=""' = any(proconfig) from pg_catalog.pg_proc where oid = 'public.preview_africa_month_end(uuid,date)'::regprocedure), 'month-end preview has an empty search_path');
select ok(not has_function_privilege('public', 'public.preview_africa_month_end(uuid,date)', 'execute'), 'PUBLIC cannot execute preview');
select ok(not has_function_privilege('anon', 'public.preview_africa_month_end(uuid,date)', 'execute'), 'anon cannot execute preview');
select ok(has_function_privilege('authenticated', 'public.preview_africa_month_end(uuid,date)', 'execute'), 'authenticated reaches the capability-guarded RPC');

-- Minimal controlled multi-tenant fixture. Every UUID is hexadecimal.
insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('f1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a-month-end@kjora.test', now(), now(), now()),
  ('f1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-b-month-end@kjora.test', now(), now(), now()),
  ('f1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'no-membership-month-end@kjora.test', now(), now(), now()),
  ('f1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'owner-c-month-end@kjora.test', now(), now(), now());

insert into public.organizations (id, created_by) values
  ('f2000000-0000-4000-8000-00000000000a', 'f1000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-00000000000b', 'f1000000-0000-4000-8000-000000000002'),
  ('f2000000-0000-4000-8000-00000000000c', 'f1000000-0000-4000-8000-000000000004');
insert into public.organization_profiles (organization_id, name, country_code, currency_code, language, timezone) values
  ('f2000000-0000-4000-8000-00000000000a', 'Month end A', 'SN', 'XOF', 'fr', 'Africa/Dakar'),
  ('f2000000-0000-4000-8000-00000000000b', 'Month end B', 'CM', 'XAF', 'fr', 'Africa/Douala');
insert into public.memberships (organization_id, user_id, role) values
  ('f2000000-0000-4000-8000-00000000000a', 'f1000000-0000-4000-8000-000000000001', 'organization_owner'),
  ('f2000000-0000-4000-8000-00000000000b', 'f1000000-0000-4000-8000-000000000002', 'organization_owner'),
  ('f2000000-0000-4000-8000-00000000000c', 'f1000000-0000-4000-8000-000000000004', 'organization_owner');

insert into public.properties (id, organization_id, name, locality, type, created_by) values
  ('f3000000-0000-4000-8000-00000000000a', 'f2000000-0000-4000-8000-00000000000a', 'Immeuble A', 'Dakar', 'building', 'f1000000-0000-4000-8000-000000000001'),
  ('f3000000-0000-4000-8000-00000000000b', 'f2000000-0000-4000-8000-00000000000b', 'Immeuble B', 'Douala', 'building', 'f1000000-0000-4000-8000-000000000002');
insert into public.units (id, organization_id, property_id, label, type, created_by) values
  ('f4000000-0000-4000-8000-00000000000a', 'f2000000-0000-4000-8000-00000000000a', 'f3000000-0000-4000-8000-00000000000a', 'A1', 'apartment', 'f1000000-0000-4000-8000-000000000001'),
  ('f4000000-0000-4000-8000-00000000000b', 'f2000000-0000-4000-8000-00000000000b', 'f3000000-0000-4000-8000-00000000000b', 'B1', 'apartment', 'f1000000-0000-4000-8000-000000000002');
insert into public.tenants (id, organization_id, full_name, email, created_by) values
  ('f5000000-0000-4000-8000-00000000000a', 'f2000000-0000-4000-8000-00000000000a', 'Locataire A', 'tenant-a-month-end@kjora.test', 'f1000000-0000-4000-8000-000000000001'),
  ('f5000000-0000-4000-8000-00000000000b', 'f2000000-0000-4000-8000-00000000000b', 'Locataire B', 'tenant-b-month-end@kjora.test', 'f1000000-0000-4000-8000-000000000002');
-- This test exercises the read-only preview, not lease activation. Disable only
-- the lifecycle trigger while creating the controlled leases so current_date
-- cannot add unrelated dues. DDL is transactional and the final rollback
-- restores the trigger state even if an assertion fails.
alter table public.leases disable trigger leases_sync_financial_lifecycle;

insert into public.leases (
  id, organization_id, property_id, unit_id, tenant_id, status, start_date,
  base_rent_xaf, recurring_charges_xaf, security_deposit_xaf, billing_frequency,
  due_day, generate_due_days_before, created_by
) values
  ('f6000000-0000-4000-8000-00000000000a', 'f2000000-0000-4000-8000-00000000000a', 'f3000000-0000-4000-8000-00000000000a', 'f4000000-0000-4000-8000-00000000000a', 'f5000000-0000-4000-8000-00000000000a', 'active', '2026-01-01', 40000, 2000, 0, 'monthly', 5, 5, 'f1000000-0000-4000-8000-000000000001'),
  ('f6000000-0000-4000-8000-00000000000b', 'f2000000-0000-4000-8000-00000000000b', 'f3000000-0000-4000-8000-00000000000b', 'f4000000-0000-4000-8000-00000000000b', 'f5000000-0000-4000-8000-00000000000b', 'active', '2026-01-01', 50000, 0, 0, 'monthly', 5, 5, 'f1000000-0000-4000-8000-000000000002');

alter table public.leases enable trigger leases_sync_financial_lifecycle;

insert into public.dues (
  id, organization_id, lease_id, tenant_id, kind, generation_key, reference,
  period_start, period_end, due_date, notice_date, rent_amount_xaf,
  recurring_charges_amount_xaf, deposit_amount_xaf, created_by
) values
  ('f7000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-00000000000a', 'f6000000-0000-4000-8000-00000000000a', 'f5000000-0000-4000-8000-00000000000a', 'periodic', 'month-end-a-oct-rent', 'DUE-ME-A-001', '2026-10-01', '2026-10-31', '2026-10-05', '2026-09-30', 40000, 2000, 0, 'f1000000-0000-4000-8000-000000000001'),
  ('f7000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-00000000000a', 'f6000000-0000-4000-8000-00000000000a', 'f5000000-0000-4000-8000-00000000000a', 'deposit', 'month-end-a-oct-deposit', 'DUE-ME-A-002', '2026-10-01', '2026-10-01', '2026-10-12', '2026-10-01', 0, 0, 10000, 'f1000000-0000-4000-8000-000000000001'),
  ('f7000000-0000-4000-8000-00000000000b', 'f2000000-0000-4000-8000-00000000000b', 'f6000000-0000-4000-8000-00000000000b', 'f5000000-0000-4000-8000-00000000000b', 'periodic', 'month-end-b-oct-rent', 'DUE-ME-B-001', '2026-10-01', '2026-10-31', '2026-10-05', '2026-09-30', 50000, 0, 0, 'f1000000-0000-4000-8000-000000000002');
insert into public.financial_documents (
  id, organization_id, tenant_id, lease_id, due_id, document_type, source_key,
  reference, status, language, issued_on, period_start, period_end, snapshot,
  review_status, approved_by, approved_at, created_by
) values (
  'f8000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-00000000000a',
  'f5000000-0000-4000-8000-00000000000a', 'f6000000-0000-4000-8000-00000000000a',
  'f7000000-0000-4000-8000-000000000001', 'due_notice', 'month-end-a-due-notice-001',
  'AVI-2026-ME0001', 'prepared', 'fr', '2026-09-30', '2026-10-01', '2026-10-31',
  '{}'::jsonb, 'approved', 'f1000000-0000-4000-8000-000000000001', now(),
  'f1000000-0000-4000-8000-000000000001'
);
insert into public.message_deliveries (
  id, organization_id, document_id, tenant_id, recipient_email, language,
  template_key, idempotency_key, trigger_type, status, next_attempt_at
) values (
  'f9000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-00000000000a',
  'f8000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-00000000000a',
  'tenant-a-month-end@kjora.test', 'fr', 'due_notice', 'month-end-a-delivery-0001',
  'manual', 'pending', now()
);

-- Snapshot all relations the RPC reads or could be tempted to mutate.
create temporary table pg_temp.month_end_before as
select
  (select count(*) from public.dues) as dues_count,
  (select count(*) from public.financial_documents) as documents_count,
  (select count(*) from public.message_deliveries) as deliveries_count,
  (select count(*) from public.ledger_entries) as ledger_count;

-- Capture the cross-Organization control while still privileged. Once the test
-- switches to the authenticated owner, RLS must hide that Organization.
select set_config(
  'pilot_month_end.expected_other_org_dues',
  (
    select count(*)::text
    from public.dues
    where organization_id = 'f2000000-0000-4000-8000-00000000000b'
      and due_date between '2026-10-01' and '2026-10-31'
  ),
  true
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000a', '2026-10-15') $$, '42501', null, 'anon is refused');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000003', true);
select throws_ok($$ select public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000a', '2026-10-15') $$, '42501', 'forbidden', 'authenticated without membership/capability is refused');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000002', true);
select throws_ok($$ select public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000a', '2026-10-15') $$, '42501', 'forbidden', 'owner of another Organization is refused');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);
select lives_ok($$ select public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000a', '2026-10-15') $$, 'owner with due.view can preview month end');
select is((public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000a', '2026-10-15')->>'leasesSelected')::integer, 1, 'one lease selected');
select is((public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000a', '2026-10-15')->>'duesSelected')::integer, 2, 'two dues selected');
select is((public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000a', '2026-10-15')->>'documentsPrepared')::integer, 1, 'one document prepared');
select is((public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000a', '2026-10-15')->>'documentsMissing')::integer, 1, 'one document missing');
select is((public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000a', '2026-10-15')->>'awaitingApproval')::integer, 0, 'no draft document');
select is((public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000a', '2026-10-15')->>'deferred')::integer, 0, 'no deferred document');
select is((public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000a', '2026-10-15')->>'approved')::integer, 1, 'one approved document');
select is((public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000a', '2026-10-15')->>'queued')::integer, 1, 'one delivery queued');
select is((public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000a', '2026-10-15')->>'sent')::integer, 0, 'no delivery sent');
select ok(
  current_setting('pilot_month_end.expected_other_org_dues', true)::integer = 1
  and (public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000a', '2026-10-15')->>'duesSelected')::integer = 2,
  'another Organization fixture never enters the counters'
);
select is(public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000a', '2026-10-15')->>'currency', 'XOF', 'allowed rental currency is preserved unchanged');
select is(public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000a', '2026-10-15')->>'monthStart', '2026-10-01', 'explicit target month is honored');
select is(
  public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000a')->>'monthStart',
  date_trunc('month', (current_timestamp at time zone 'Africa/Dakar')::date)::date::text,
  'NULL/default target month uses the Organization local date'
);
reset role;

-- Direct privileged reads happen only after RESET ROLE.
select is(
  row((select count(*) from public.dues), (select count(*) from public.financial_documents), (select count(*) from public.message_deliveries), (select count(*) from public.ledger_entries))::text,
  row((select dues_count from pg_temp.month_end_before), (select documents_count from pg_temp.month_end_before), (select deliveries_count from pg_temp.month_end_before), (select ledger_count from pg_temp.month_end_before))::text,
  'preview performs no database write'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000004', true);
select throws_ok($$ select public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000c', '2026-10-15') $$, '22023', 'organization_profile_required', 'missing profile is refused');
reset role;

insert into public.organization_profiles (organization_id, name, country_code, currency_code, language, timezone)
values ('f2000000-0000-4000-8000-00000000000c', 'Month end C', 'CM', 'XAF', 'fr', 'Africa/Douala');
alter table public.organization_profiles alter column currency_code drop not null;
alter table public.organization_profiles drop constraint organization_profiles_currency_code_check;
update public.organization_profiles set currency_code = null where organization_id = 'f2000000-0000-4000-8000-00000000000c';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000004', true);
select throws_ok($$ select public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000c', '2026-10-15') $$, '22023', 'organization_currency_required', 'NULL currency is refused');
reset role;

update public.organization_profiles set currency_code = 'USD' where organization_id = 'f2000000-0000-4000-8000-00000000000c';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000004', true);
select throws_ok($$ select public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000c', '2026-10-15') $$, '22023', 'unsupported_rental_currency', 'unsupported currency is refused');
reset role;

alter table public.organization_profiles alter column timezone drop not null;
alter table public.organization_profiles disable trigger organization_profiles_validate_timezone;
update public.organization_profiles set currency_code = 'XAF', timezone = null where organization_id = 'f2000000-0000-4000-8000-00000000000c';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000004', true);
select throws_ok($$ select public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000c', '2026-10-15') $$, '22023', 'organization_timezone_required', 'NULL timezone is refused');
reset role;

update public.organization_profiles set timezone = 'Mars/Olympus' where organization_id = 'f2000000-0000-4000-8000-00000000000c';
alter table public.organization_profiles enable trigger organization_profiles_validate_timezone;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000004', true);
select throws_ok($$ select public.preview_africa_month_end('f2000000-0000-4000-8000-00000000000c', '2026-10-15') $$, '22023', 'invalid_organization_timezone', 'invalid IANA timezone is refused');
reset role;

select * from finish();
rollback;
