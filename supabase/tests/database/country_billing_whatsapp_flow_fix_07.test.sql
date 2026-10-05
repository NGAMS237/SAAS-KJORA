begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select is((select amount_minor from public.billing_prices where plan='essentiel' and cycle='monthly' and currency='XOF'),5900::bigint,'CI monthly price is stored in XOF');
select is((select amount_minor from public.billing_prices where plan='essentiel' and cycle='annual' and currency='XOF'),59000::bigint,'XOF annual price follows the reviewed nominal catalog');
select throws_ok($$insert into public.organization_subscriptions(organization_id,billing_country,currency) values('b7200000-0000-4000-8000-000000000099','CI','XAF')$$,'23503',null,'unknown Organization is refused before any market pair can leak');
select ok(not has_function_privilege('anon','public.replace_site_app_intent(text,text,text,text,text)','execute'),'anon cannot persist intent');
select ok(not has_function_privilege('anon','public.prepare_plan_change_for_market(uuid,text,text,text)','execute'),'anon cannot prepare billing');
select ok(has_function_privilege('authenticated','public.replace_site_app_intent(text,text,text,text,text)','execute'),'authenticated may call guarded intent RPC');
select ok(has_function_privilege('authenticated','public.prepare_plan_change_for_market(uuid,text,text,text)','execute'),'authenticated may call guarded billing RPC');
select ok((select prosecdef and 'search_path=""'=any(proconfig) from pg_proc where oid='public.replace_site_app_intent(text,text,text,text,text)'::regprocedure),'intent RPC is SECURITY DEFINER with empty search_path');
select ok((select prosecdef and 'search_path=""'=any(proconfig) from pg_proc where oid='public.prepare_plan_change_for_market(uuid,text,text,text)'::regprocedure),'billing RPC is SECURITY DEFINER with empty search_path');

insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at) values
 ('b7100000-0000-4000-8000-000000000001','authenticated','authenticated','owner-flow07@kjora.test',now(),now(),now()),
 ('b7100000-0000-4000-8000-000000000002','authenticated','authenticated','other-flow07@kjora.test',now(),now(),now());
insert into public.organizations(id,created_by) values
 ('b7200000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000001'),
 ('b7200000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000002');
insert into public.organization_profiles(organization_id,name,country_code,currency_code,language,timezone) values
 ('b7200000-0000-4000-8000-000000000001','Flow 07 CI','CI','XOF','fr','Africa/Abidjan'),
 ('b7200000-0000-4000-8000-000000000002','Flow 07 CM','CM','XAF','fr','Africa/Douala');
insert into public.memberships(organization_id,user_id,role,status) values
 ('b7200000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000001','organization_owner','active'),
 ('b7200000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000002','organization_owner','active');
insert into public.organization_plans(organization_id,plan) values
 ('b7200000-0000-4000-8000-000000000001','decouverte'),
 ('b7200000-0000-4000-8000-000000000002','decouverte') on conflict(organization_id) do update set plan=excluded.plan;

set local role authenticated;
set local request.jwt.claims to '{"sub":"b7100000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((public.replace_site_app_intent('essentiel','annual','CI','fr','site')->>'billing_country_intent'),'CI','CI intent persists');
select is((public.prepare_plan_change_for_market('b7200000-0000-4000-8000-000000000001','essentiel','annual','CI')->>'currency'),'XOF','CI maps to XOF server-side');
select is((select concat_ws('|',billing_country,currency) from public.organization_subscriptions where organization_id='b7200000-0000-4000-8000-000000000001'),'CI|XOF','validated CI/XOF pair persists');
select is((select currency_code from public.organization_profiles where organization_id='b7200000-0000-4000-8000-000000000001'),'XOF','rental currency stays XOF');
select is((select plan from public.organization_plans where organization_id='b7200000-0000-4000-8000-000000000001'),'decouverte','paid URL intent never activates an entitlement');
select throws_ok($$select public.prepare_plan_change_for_market('b7200000-0000-4000-8000-000000000002','essentiel','monthly','CI')$$,'42501',null,'cross-Organization billing is refused');
select throws_ok($$update public.organization_subscriptions set currency='XAF' where organization_id='b7200000-0000-4000-8000-000000000001'$$,'23514',null,'CI/XAF is refused');
select lives_ok($$select public.prepare_plan_change_for_market('b7200000-0000-4000-8000-000000000001','decouverte','monthly','CI')$$,'Discovery remains free in CI');

reset role;
select is((select count(distinct currency)::int from public.billing_prices where currency in('XAF','XOF') and amount_minor=5900),2,'XAF and XOF remain separate ISO catalog entries');
select is((select count(*)::int from public.organization_plans where organization_id='b7200000-0000-4000-8000-000000000001' and plan<>'decouverte'),0,'no paid plan was activated');
select is((select count(*)::int from public.billing_invoices where organization_id='b7200000-0000-4000-8000-000000000001'),0,'billing preparation writes no invoice');

select * from finish();
rollback;
