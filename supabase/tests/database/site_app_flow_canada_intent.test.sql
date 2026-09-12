begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

select has_column('public', 'onboarding_states', 'billing_country_intent',
  'onboarding intent stores an explicit SaaS billing country');
select is((select billing_country from public.organization_subscriptions
  where organization_id='caf20000-0000-4000-8000-0000000000ca'), 'CA',
  'CAD subscription is backfilled to Canada');
select is((select billing_country from public.organization_subscriptions
  where organization_id='caf20000-0000-4000-8000-0000000000cc'), 'CM',
  'XAF subscription is backfilled to Cameroon');
select is((select currency_code from public.organization_profiles
  where organization_id='caf20000-0000-4000-8000-0000000000ca'), 'XAF',
  'Canada subscriber rental currency remains XAF');

select throws_ok(
  $q$ update public.organization_subscriptions set billing_country='CA', currency='XAF'
      where organization_id='caf20000-0000-4000-8000-0000000000ca' $q$,
  '23514', null, 'CA/XAF market pair is refused');
select throws_ok(
  $q$ update public.organization_subscriptions set billing_country='CM', currency='CAD'
      where organization_id='caf20000-0000-4000-8000-0000000000cc' $q$,
  '23514', null, 'CM/CAD market pair is refused');

select ok(not has_function_privilege('anon',
  'public.replace_site_app_intent(text,text,text,text,text)', 'execute'),
  'anon cannot replace a commercial intent');
select ok(not has_function_privilege('anon',
  'public.prepare_plan_change_for_market(uuid,text,text,text)', 'execute'),
  'anon cannot prepare billing');
select is((select proconfig::text from pg_proc where oid=
  'public.replace_site_app_intent(text,text,text,text,text)'::regprocedure),
  '{search_path=""}', 'intent RPC uses an empty search_path');
select is((select proconfig::text from pg_proc where oid=
  'public.prepare_plan_change_for_market(uuid,text,text,text)'::regprocedure),
  '{search_path=""}', 'billing RPC uses an empty search_path');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"caf10000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $q$ select public.replace_site_app_intent(null,'monthly','CA','fr','site') $q$,
  '22023', null, 'null plan is refused');
select throws_ok(
  $q$ select public.replace_site_app_intent('essentiel',null,'CA','fr','site') $q$,
  '22023', null, 'null cycle is refused');
select throws_ok(
  $q$ select public.replace_site_app_intent('essentiel','monthly','US','fr','site') $q$,
  '22023', null, 'unsupported billing country is refused');
select lives_ok(
  $q$ select public.replace_site_app_intent('essentiel','annual',null,'en','site') $q$,
  'billing country may remain pending during intent capture');

select is(
  (public.replace_site_app_intent('essentiel','annual','CA','en','site') ->> 'plan_intent'),
  'essentiel', 'a valid intent is stored');
select is((select billing_cycle_intent from public.onboarding_states
  where user_id='caf10000-0000-4000-8000-000000000001'), 'annual',
  'annual cycle survives persistence');

select lives_ok(
  $q$ select public.replace_site_app_intent('avance','monthly','CM','fr','site') $q$,
  'a new valid intent atomically replaces the old intent');
select is(
  (select concat_ws('|', plan_intent, billing_cycle_intent,
    billing_country_intent, locale_intent, source_intent, intent_status)
   from public.onboarding_states
   where user_id='caf10000-0000-4000-8000-000000000001'),
  'avance|monthly|CM|fr|site|active',
  'replacement updates the complete controlled intent');

select is(
  (public.prepare_plan_change_for_market(
    'caf20000-0000-4000-8000-0000000000ca','essentiel','annual','CA') ->> 'currency'),
  'CAD', 'Canada maps to CAD on the server');
select is((select concat_ws('|',billing_country,currency) from public.organization_subscriptions
  where organization_id='caf20000-0000-4000-8000-0000000000ca'),
  'CA|CAD', 'Canada subscription persists the validated market pair');
select is((select plan from public.organization_plans
  where organization_id='caf20000-0000-4000-8000-0000000000ca'),
  'decouverte', 'paid intent never activates a paid entitlement');
select is((select currency_code from public.organization_profiles
  where organization_id='caf20000-0000-4000-8000-0000000000ca'),
  'XAF', 'billing preparation never changes rental currency');

select is(
  (public.prepare_plan_change_for_market(
    'caf20000-0000-4000-8000-0000000000ca','decouverte','monthly','CA') ->> 'currency'),
  'CAD', 'free Discovery remains cardless in CAD');
select is((select status from public.organization_subscriptions
  where organization_id='caf20000-0000-4000-8000-0000000000ca'),
  'free', 'Discovery stays a free subscription');

select throws_ok(
  $q$ select public.prepare_plan_change_for_market(
    'caf20000-0000-4000-8000-0000000000cc','essentiel','monthly','CA') $q$,
  '42501', null, 'an owner cannot prepare another Organization');

set local request.jwt.claims to
  '{"sub":"caf10000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $q$ select public.prepare_plan_change_for_market(
    'caf20000-0000-4000-8000-0000000000ca','essentiel','monthly','CA') $q$,
  '42501', null, 'billing.manage capability is mandatory');

reset role;
update public.organization_subscriptions
   set status='active', billing_country='CM', currency='XAF'
 where organization_id='caf20000-0000-4000-8000-0000000000cc';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"caf10000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (public.prepare_plan_change_for_market(
    'caf20000-0000-4000-8000-0000000000cc','essentiel','monthly','CA') ->> 'outcome'),
  'billing_country_change_requires_support',
  'a paid subscription market cannot be silently changed');
select is((select concat_ws('|',billing_country,currency) from public.organization_subscriptions
  where organization_id='caf20000-0000-4000-8000-0000000000cc'),
  'CM|XAF', 'refused paid market change preserves the original pair');

reset role;
select has_function('public','list_contracts_for_export',array['uuid'],
  'EXPORT-01 RPC remains present');
select ok(not has_function_privilege('anon',
  'public.list_contracts_for_export(uuid)', 'execute'),
  'EXPORT-01 RPC remains unavailable to anon');
select is((select count(*)::int from public.organization_plans
  where organization_id in ('caf20000-0000-4000-8000-0000000000ca',
                            'caf20000-0000-4000-8000-0000000000cc')
    and plan <> 'decouverte'), 0,
  'no commercial intent activates a paid plan');

select * from finish();
rollback;
