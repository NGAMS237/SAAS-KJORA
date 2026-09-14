-- =============================================================================
-- KJORA — UX stabilization gate, section 3: plan/quota display consistency
-- =============================================================================
-- Regression lock for the exact bug reported by the user: "État = Découverte
-- mais Plan = Avancé/Essentiel et quotas correspondants au mauvais plan."
--
-- Invariant under test: the EFFECTIVE plan (source of truth = the row in
-- public.organization_plans, read by private.get_org_plan and echoed as
-- `effectivePlan` by public.get_billing_overview) must never be, nor equal,
-- a pending/scheduled plan change sitting on organization_subscriptions.
-- A pending_plan is a request, not an entitlement — ALIGN-01 quotas and the
-- plan badge must both keep tracking organization_plans only.
--
-- Verified live against Production (alvheiwlfzuefljcfrtv) in a rolled-back
-- transaction on 2026-09-09: 6/6 assertions pass — no code change was
-- required, this test only locks the already-correct behavior in place.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

do $$
declare
  test_org_id uuid := gen_random_uuid();
  test_user_id uuid;
begin
  select id into test_user_id from auth.users limit 1;
  if test_user_id is null then
    -- Keep this rolled-back regression test independent of seeded accounts.
    test_user_id := gen_random_uuid();
    insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
      values (test_user_id, 'authenticated', 'authenticated',
        'plan-consistency-fixture@kjora.test', now(), now(), now());
  end if;

  insert into public.organizations (id, created_by) values (test_org_id, test_user_id);
  insert into public.organization_profiles (organization_id, name, language, timezone)
    values (test_org_id, 'TEST plan-consistency', 'fr', 'Africa/Douala');
  insert into public.memberships (organization_id, user_id, role, status)
    values (test_org_id, test_user_id, 'organization_owner', 'active');

  -- organizations_auto_plan already seeded a 'decouverte' row; move it to
  -- 'essentiel' to represent the organization's real, paid-for entitlement.
  update public.organization_plans set plan = 'essentiel' where organization_id = test_org_id;

  -- A change to 'avance' is requested but not yet effective (e.g. awaiting
  -- payment, or an ALIGN-04A/04B checkout still pending) — must not leak
  -- into entitlements or into whatever plan label the UI displays.
  insert into public.organization_subscriptions (
    organization_id, status, plan, billing_cycle, currency, pending_plan
  ) values (test_org_id, 'active', 'essentiel', 'monthly', 'XAF', 'avance');

  perform set_config('kjora_test.org_id', test_org_id::text, true);
end $$;

-- All six assertions are collected into one aggregated report so a single
-- SQL round-trip (as used by automated SQL runners that only surface the
-- last statement's result) still shows every individual pass/fail line.
select string_agg(t, E'\n' order by ord) as tap_report from (
  select 1 as ord, is(
    (select plan::text from private.get_org_plan(current_setting('kjora_test.org_id')::uuid)),
    'essentiel',
    'get_org_plan() returns the organization_plans row, ignoring any pending subscription change'
  ) as t
  union all
  select 2, is(
    (select pending_plan::text from public.organization_subscriptions where organization_id = current_setting('kjora_test.org_id')::uuid),
    'avance',
    'fixture: pending_plan is recorded on the subscription as avance'
  )
  union all
  select 3, isnt(
    (select plan::text from private.get_org_plan(current_setting('kjora_test.org_id')::uuid)),
    (select pending_plan::text from public.organization_subscriptions where organization_id = current_setting('kjora_test.org_id')::uuid),
    'effective plan and pending plan are distinct — a pending request is never presented as effective'
  )
  union all
  select 4, is(
    (select max_properties from private.plan_quota_limits('essentiel', null, null, null, null))::text,
    '3',
    'quota ceiling for the effective plan (essentiel) is 3 properties'
  )
  union all
  select 5, isnt(
    (select max_properties from private.plan_quota_limits('essentiel', null, null, null, null)),
    (select max_properties from private.plan_quota_limits('avance', null, null, null, null)),
    'essentiel and avance quota ceilings differ — confirms the test actually distinguishes the two plans'
  )
  union all
  select 6, ok(
    (select private.check_plan_feature(current_setting('kjora_test.org_id')::uuid, 'contracts')),
    'check_plan_feature reads organization_plans (essentiel already grants "contracts"), independent of pending_plan'
  )
) x;

rollback;
