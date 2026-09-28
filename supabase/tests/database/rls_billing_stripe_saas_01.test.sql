begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select ok(to_regclass('public.billing_provider_intents') is not null, 'table des intentions Stripe présente');
select ok((select relrowsecurity from pg_class where oid='public.billing_provider_intents'::regclass), 'RLS active');
select ok(not has_table_privilege('anon','public.billing_provider_intents','select'), 'anon ne lit pas les intentions');
select ok(not has_table_privilege('authenticated','public.billing_provider_intents','select'), 'authenticated ne lit pas directement les intentions');
select ok(not has_function_privilege('anon','public.prepare_stripe_test_checkout(uuid,text,text,text,text)','execute'), 'anon ne prépare pas Checkout');
select ok(has_function_privilege('authenticated','public.prepare_stripe_test_checkout(uuid,text,text,text,text)','execute'), 'authenticated passe par la RPC gardée');
select ok(not has_function_privilege('authenticated','public.process_stripe_test_event(text,text,timestamptz,text,text,text,text,text,text,boolean,timestamptz)','execute'), 'authenticated ne traite pas les webhooks');
select ok(has_function_privilege('service_role','public.process_stripe_test_event(text,text,timestamptz,text,text,text,text,text,text,boolean,timestamptz)','execute'), 'service_role seul traite les webhooks');
select col_is_null('public','billing_provider_intents','checkout_session_ref','session absente avant Checkout');
select ok(position('CAD' in pg_get_constraintdef((select oid from pg_constraint where conname='billing_provider_intents_currency_check'))) > 0, 'intentions Stripe limitées au CAD');

select * from finish();
rollback;
