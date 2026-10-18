begin;
select plan(24);

select has_table('public','paid_pilot_access','11.1 allowlist exists');
select col_is_pk('public','paid_pilot_access','organization_id','11.2 one allowlist row per Organization');
select ok((select relrowsecurity from pg_class where oid='public.paid_pilot_access'::regclass),'11.3 allowlist RLS enabled');
select table_privs_are('public','paid_pilot_access','anon',array[]::text[],'11.4 anon has no allowlist privilege');
select table_privs_are('public','paid_pilot_access','authenticated',array[]::text[],'11.5 authenticated has no direct allowlist privilege');

select has_function('public','paid_pilot_checkout_eligibility',array['uuid'],'11.6 eligibility RPC exists');
select function_privs_are('public','paid_pilot_checkout_eligibility',array['uuid'],'anon',array[]::text[],'11.7 anon cannot test eligibility');
select function_privs_are('public','paid_pilot_checkout_eligibility',array['uuid'],'authenticated',array['EXECUTE'],'11.8 authenticated can call guarded eligibility');
select is((select prosecdef from pg_proc where oid='public.paid_pilot_checkout_eligibility(uuid)'::regprocedure),true,'11.9 eligibility is SECURITY DEFINER');
select ok(coalesce((
  select array_to_string(proconfig, ',') in ('search_path=', 'search_path=""')
  from pg_proc where oid='public.paid_pilot_checkout_eligibility(uuid)'::regprocedure
), false),'11.10 eligibility search_path is empty');
select ok(pg_get_functiondef('public.paid_pilot_checkout_eligibility(uuid)'::regprocedure) like '%organization_owner%','11.11 Owner role required');
select ok(pg_get_functiondef('public.paid_pilot_checkout_eligibility(uuid)'::regprocedure) like '%billing.manage%','11.12 billing.manage required');

select has_function('public','process_stripe_event_v2',array['text','text','text','timestamp with time zone','text','text','text','text','text','text','boolean','timestamp with time zone','text','bigint','text','timestamp with time zone','timestamp with time zone','timestamp with time zone'],'11.13 Stripe processor exists');
select function_privs_are('public','process_stripe_event_v2',array['text','text','text','timestamp with time zone','text','text','text','text','text','text','boolean','timestamp with time zone','text','bigint','text','timestamp with time zone','timestamp with time zone','timestamp with time zone'],'anon',array[]::text[],'11.14 anon cannot process Stripe events');
select function_privs_are('public','process_stripe_event_v2',array['text','text','text','timestamp with time zone','text','text','text','text','text','text','boolean','timestamp with time zone','text','bigint','text','timestamp with time zone','timestamp with time zone','timestamp with time zone'],'authenticated',array[]::text[],'11.15 authenticated cannot process Stripe events');
select function_privs_are('public','process_stripe_event_v2',array['text','text','text','timestamp with time zone','text','text','text','text','text','text','boolean','timestamp with time zone','text','bigint','text','timestamp with time zone','timestamp with time zone','timestamp with time zone'],'service_role',array['EXECUTE'],'11.16 service role alone can process Stripe events');
select ok(coalesce((
  select array_to_string(proconfig, ',') in ('search_path=', 'search_path=""')
  from pg_proc where oid='public.process_stripe_event_v2(text,text,text,timestamptz,text,text,text,text,text,text,boolean,timestamptz,text,bigint,text,timestamptz,timestamptz,timestamptz)'::regprocedure
), false),'11.17 Stripe processor search_path is empty');
select ok(pg_get_functiondef('public.process_stripe_event_v2(text,text,text,timestamptz,text,text,text,text,text,text,boolean,timestamptz,text,bigint,text,timestamptz,timestamptz,timestamptz)'::regprocedure) like '%on conflict (provider, provider_event_id) do nothing%','11.18 provider event replay is idempotent');
select ok(pg_get_functiondef('public.process_stripe_event_v2(text,text,text,timestamptz,text,text,text,text,text,text,boolean,timestamptz,text,bigint,text,timestamptz,timestamptz,timestamptz)'::regprocedure) like '%event_out_of_order%','11.19 out-of-order events are explicit');
select ok(pg_get_functiondef('public.process_stripe_event_v2(text,text,text,timestamptz,text,text,text,text,text,text,boolean,timestamptz,text,bigint,text,timestamptz,timestamptz,timestamptz)'::regprocedure) like '%insert into public.billing_invoices%','11.20 provider invoices are synchronized');
select ok(pg_get_functiondef('public.process_stripe_event_v2(text,text,text,timestamptz,text,text,text,text,text,text,boolean,timestamptz,text,bigint,text,timestamptz,timestamptz,timestamptz)'::regprocedure) not like '%rent_payments%','11.21 rent payments remain separate');
select ok(pg_get_functiondef('public.process_stripe_event_v2(text,text,text,timestamptz,text,text,text,text,text,text,boolean,timestamptz,text,bigint,text,timestamptz,timestamptz,timestamptz)'::regprocedure) like '%stripe_invoice_contract_mismatch%','11.22 invoice amount/currency contract is fail closed');
select ok(pg_get_functiondef('public.process_stripe_event_v2(text,text,text,timestamptz,text,text,text,text,text,text,boolean,timestamptz,text,bigint,text,timestamptz,timestamptz,timestamptz)'::regprocedure) like '%assign_organization_plan(intent.organization_id, ''decouverte'')%','11.23 cancellation revokes paid entitlement');
select ok(pg_get_functiondef('public.process_stripe_event_v2(text,text,text,timestamptz,text,text,text,text,text,text,boolean,timestamptz,text,bigint,text,timestamptz,timestamptz,timestamptz)'::regprocedure) not like '%payment_method_last4%','11.24 processor stores no card detail');

select * from finish();
rollback;
