begin;
create extension if not exists pgtap with schema extensions;
select plan(55);

select is((select amount_minor from public.billing_prices where plan='essentiel' and cycle='monthly' and currency='XOF'),5900::bigint,'CI monthly price is stored in XOF');
select is((select amount_minor from public.billing_prices where plan='essentiel' and cycle='annual' and currency='XOF'),59000::bigint,'XOF annual price follows the reviewed nominal catalog');
select ok(not has_function_privilege('anon','public.prepare_plan_change_for_market(uuid,text,text,text)','execute'),'anon cannot prepare billing, including through PUBLIC');
select ok(not exists(
  select 1 from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
  where p.oid='public.prepare_plan_change_for_market(uuid,text,text,text)'::regprocedure
    and acl.grantee=0 and acl.privilege_type='EXECUTE'
),'PUBLIC has no EXECUTE on guarded billing RPC');
select ok(has_function_privilege('authenticated','public.prepare_plan_change_for_market(uuid,text,text,text)','execute'),'authenticated may call guarded billing RPC');
select ok((select prosecdef and 'search_path=""'=any(proconfig) from pg_proc where oid='public.prepare_plan_change_for_market(uuid,text,text,text)'::regprocedure),'billing RPC is SECURITY DEFINER with empty search_path');
select ok((select position('auth.uid()' in pg_get_functiondef('public.prepare_plan_change_for_market(uuid,text,text,text)'::regprocedure))>0),'billing RPC checks auth.uid explicitly');
select ok((select position('billing.manage' in pg_get_functiondef('public.prepare_plan_change_for_market(uuid,text,text,text)'::regprocedure))>0),'billing RPC requires billing.manage');

insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at) values
 ('b7100000-0000-4000-8000-000000000001','authenticated','authenticated','owner-flow07-v2@kjora.test',now(),now(),now()),
 ('b7100000-0000-4000-8000-000000000002','authenticated','authenticated','other-flow07-v2@kjora.test',now(),now(),now());

insert into public.organizations(id,created_by) values
 ('b7200000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000001'),
 ('b7200000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000001'),
 ('b7200000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000001'),
 ('b7200000-0000-4000-8000-000000000004','b7100000-0000-4000-8000-000000000001'),
 ('b7200000-0000-4000-8000-000000000005','b7100000-0000-4000-8000-000000000001'),
 ('b7200000-0000-4000-8000-000000000006','b7100000-0000-4000-8000-000000000001'),
 ('b7200000-0000-4000-8000-000000000007','b7100000-0000-4000-8000-000000000001'),
 ('b7200000-0000-4000-8000-000000000008','b7100000-0000-4000-8000-000000000002'),
 ('b7200000-0000-4000-8000-000000000009','b7100000-0000-4000-8000-000000000001'),
 ('b7200000-0000-4000-8000-000000000010','b7100000-0000-4000-8000-000000000001'),
 ('b7200000-0000-4000-8000-000000000011','b7100000-0000-4000-8000-000000000001'),
 ('b7200000-0000-4000-8000-000000000012','b7100000-0000-4000-8000-000000000001');

insert into public.organization_profiles(organization_id,name,country_code,currency_code,language,timezone) values
 ('b7200000-0000-4000-8000-000000000001','Flow 07 v2 pristine','CI','XOF','fr','Africa/Abidjan');

insert into public.memberships(organization_id,user_id,role,status)
select id,'b7100000-0000-4000-8000-000000000001','organization_owner','active'
from public.organizations where id in(
 'b7200000-0000-4000-8000-000000000001','b7200000-0000-4000-8000-000000000002',
 'b7200000-0000-4000-8000-000000000003','b7200000-0000-4000-8000-000000000004',
 'b7200000-0000-4000-8000-000000000005','b7200000-0000-4000-8000-000000000006',
 'b7200000-0000-4000-8000-000000000007','b7200000-0000-4000-8000-000000000009',
 'b7200000-0000-4000-8000-000000000010','b7200000-0000-4000-8000-000000000011',
 'b7200000-0000-4000-8000-000000000012'
);
insert into public.memberships(organization_id,user_id,role,status) values
 ('b7200000-0000-4000-8000-000000000008','b7100000-0000-4000-8000-000000000002','organization_owner','active');

insert into public.organization_plans(organization_id,plan)
select id,'decouverte' from public.organizations where id between
 'b7200000-0000-4000-8000-000000000001' and 'b7200000-0000-4000-8000-000000000012';

insert into public.organization_subscriptions(organization_id,status,plan,billing_country,currency) values
 ('b7200000-0000-4000-8000-000000000001','free','decouverte','CM','XAF'),
 ('b7200000-0000-4000-8000-000000000002','free','decouverte','CM','XAF'),
 ('b7200000-0000-4000-8000-000000000003','free','decouverte','CM','XAF'),
 ('b7200000-0000-4000-8000-000000000004','free','decouverte','CM','XAF'),
 ('b7200000-0000-4000-8000-000000000005','free','decouverte','CM','XAF'),
 ('b7200000-0000-4000-8000-000000000006','active','essentiel','CM','XAF'),
 ('b7200000-0000-4000-8000-000000000007','free','decouverte','CM','XAF'),
 ('b7200000-0000-4000-8000-000000000008','free','decouverte','CM','XAF'),
 ('b7200000-0000-4000-8000-000000000009','free','decouverte','CM','XAF'),
 ('b7200000-0000-4000-8000-000000000010','free','decouverte','CM','XAF'),
 ('b7200000-0000-4000-8000-000000000011','free','decouverte','CM','XAF'),
 ('b7200000-0000-4000-8000-000000000012','free','decouverte','CM','XAF');

update public.organization_subscriptions
set provider_customer_ref='customer-flow07-v2'
where organization_id='b7200000-0000-4000-8000-000000000005';
update public.organization_subscriptions
set provider='stripe',provider_customer_ref='customer-paid-flow07-v2',provider_subscription_ref='subscription-paid-flow07-v2'
where organization_id='b7200000-0000-4000-8000-000000000006';

insert into public.billing_invoices(
 id,organization_id,number,plan,billing_cycle,currency,amount_minor,period_start,period_end,status
) values(
 'b7300000-0000-4000-8000-000000000002','b7200000-0000-4000-8000-000000000002','FLOW07-V2-INV-001',
 'decouverte','monthly','XAF',0,'2026-01-01','2026-02-01','void'
);
insert into public.billing_payment_attempts(
 id,organization_id,attempt_number,scheduled_on,status,idempotency_key
) values(
 'b7400000-0000-4000-8000-000000000003','b7200000-0000-4000-8000-000000000003',0,'2026-01-02','cancelled','flow07-v2-attempt-0003'
);
insert into public.billing_events(id,organization_id,event_type) values
 ('b7500000-0000-4000-8000-000000000004','b7200000-0000-4000-8000-000000000004','flow07_v2_historical_event');
insert into public.billing_invoices(
 id,organization_id,number,plan,billing_cycle,currency,amount_minor,period_start,period_end,status
) values(
 'b7300000-0000-4000-8000-000000000007','b7200000-0000-4000-8000-000000000007','FLOW07-V2-INV-007',
 'decouverte','monthly','XAF',0,'2026-01-01','2026-02-01','void'
);
insert into public.billing_provider_intents(
 id,organization_id,provider,mode,plan,billing_cycle,currency,expected_amount_minor,provider_price_ref,idempotency_key,status
) values(
 'b7600000-0000-4000-8000-000000000009','b7200000-0000-4000-8000-000000000009','stripe','sandbox',
 'essentiel','monthly','CAD',7900,'price_flow07_v2','flow07-v2-provider-intent-0009','prepared'
);
insert into public.billing_webhook_events(
 id,provider,provider_event_id,event_type,mode,organization_id,disposition,payload_digest,signature_verified
) values(
 'b7700000-0000-4000-8000-000000000010','stripe','evt-flow07-v2-0010','checkout.test','sandbox',
 'b7200000-0000-4000-8000-000000000010','acknowledge_unhandled','digest-flow07-v2-0010',true
);
insert into public.commercial_interventions(
 id,organization_id,intervention_type,reason_code,admin_note,granted_plan,starts_on,ends_on,status,created_by,idempotency_key
) values(
 'b7800000-0000-4000-8000-000000000011','b7200000-0000-4000-8000-000000000011',
 'complimentary','sales_gift','Flow 07 v2 historical intervention','essentiel','2026-01-01','2026-02-01','expired',
 'b7100000-0000-4000-8000-000000000001','flow07-v2-commercial-0011'
);
insert into public.billing_reminder_log(id,organization_id,reminder_type,target_date) values
 ('b7900000-0000-4000-8000-000000000012','b7200000-0000-4000-8000-000000000012','renewal_reminder_j7','2026-01-08');

create temporary table flow07_v2_before as
select
 (select count(*) from public.billing_invoices where organization_id::text like 'b7200000-0000-4000-8000-0000000000%') invoices,
 (select count(*) from public.billing_payment_attempts where organization_id::text like 'b7200000-0000-4000-8000-0000000000%') attempts,
 (select count(*) from public.billing_events where organization_id::text like 'b7200000-0000-4000-8000-0000000000%') events,
 (select count(*) from public.billing_provider_intents where organization_id::text like 'b7200000-0000-4000-8000-0000000000%') provider_intents,
 (select count(*) from public.billing_webhook_events where organization_id::text like 'b7200000-0000-4000-8000-0000000000%') webhook_events,
 (select count(*) from public.commercial_interventions where organization_id::text like 'b7200000-0000-4000-8000-0000000000%') interventions,
 (select count(*) from public.billing_reminder_log where organization_id::text like 'b7200000-0000-4000-8000-0000000000%') reminders,
 (select count(*) from public.billing_email_deliveries where organization_id::text like 'b7200000-0000-4000-8000-0000000000%') email_deliveries,
 (select jsonb_object_agg(organization_id::text,billing_country||'|'||currency)
    from public.organization_subscriptions where organization_id in(
     'b7200000-0000-4000-8000-000000000002','b7200000-0000-4000-8000-000000000003',
     'b7200000-0000-4000-8000-000000000004','b7200000-0000-4000-8000-000000000005',
     'b7200000-0000-4000-8000-000000000006','b7200000-0000-4000-8000-000000000009',
     'b7200000-0000-4000-8000-000000000010','b7200000-0000-4000-8000-000000000011',
     'b7200000-0000-4000-8000-000000000012'
    )) blocked_markets,
 (select jsonb_object_agg(organization_id::text,plan)
    from public.organization_plans where organization_id::text like 'b7200000-0000-4000-8000-0000000000%') entitlements;

set local role authenticated;
set local request.jwt.claims to '{"sub":"b7100000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((public.prepare_plan_change_for_market('b7200000-0000-4000-8000-000000000001','decouverte','monthly','CI')->>'outcome'),'unchanged','pristine free subscription follows normal plan workflow after market repair');
select is((select billing_country||'|'||currency from public.organization_subscriptions where organization_id='b7200000-0000-4000-8000-000000000001'),'CI|XOF','pristine CM/XAF subscription is repaired to CI/XOF');
select is((select currency_code from public.organization_profiles where organization_id='b7200000-0000-4000-8000-000000000001'),'XOF','rental currency remains independently XOF');
select is((select plan from public.organization_plans where organization_id='b7200000-0000-4000-8000-000000000001'),'decouverte','market repair never activates a paid entitlement');

select is((public.prepare_plan_change_for_market('b7200000-0000-4000-8000-000000000002','decouverte','monthly','CI')->>'outcome'),'billing_country_change_requires_support','historical invoice blocks market repair');
select is((public.prepare_plan_change_for_market('b7200000-0000-4000-8000-000000000002','decouverte','monthly','CI')->>'billingCountry'),'CM','blocked invoice case returns recorded billing country');
select is((public.prepare_plan_change_for_market('b7200000-0000-4000-8000-000000000002','decouverte','monthly','CI')->>'currency'),'XAF','blocked invoice case returns recorded currency');
select is((select billing_country||'|'||currency from public.organization_subscriptions where organization_id='b7200000-0000-4000-8000-000000000002'),'CM|XAF','invoice case leaves market unchanged');

select is((public.prepare_plan_change_for_market('b7200000-0000-4000-8000-000000000003','decouverte','monthly','CI')->>'outcome'),'billing_country_change_requires_support','historical payment attempt blocks market repair');
select is((select billing_country||'|'||currency from public.organization_subscriptions where organization_id='b7200000-0000-4000-8000-000000000003'),'CM|XAF','payment attempt case leaves market unchanged');

select is((public.prepare_plan_change_for_market('b7200000-0000-4000-8000-000000000004','decouverte','monthly','CI')->>'outcome'),'billing_country_change_requires_support','historical billing event blocks market repair');
select is((select billing_country||'|'||currency from public.organization_subscriptions where organization_id='b7200000-0000-4000-8000-000000000004'),'CM|XAF','billing event case leaves market unchanged');

select is((public.prepare_plan_change_for_market('b7200000-0000-4000-8000-000000000005','decouverte','monthly','CI')->>'outcome'),'billing_country_change_requires_support','provider reference blocks free subscription market repair');
select is((select billing_country||'|'||currency from public.organization_subscriptions where organization_id='b7200000-0000-4000-8000-000000000005'),'CM|XAF','provider reference case leaves market unchanged');

select is((public.prepare_plan_change_for_market('b7200000-0000-4000-8000-000000000006','essentiel','monthly','CI')->>'outcome'),'billing_country_change_requires_support','paid subscription blocks market repair');
select is((select billing_country||'|'||currency from public.organization_subscriptions where organization_id='b7200000-0000-4000-8000-000000000006'),'CM|XAF','paid subscription leaves market unchanged');

select is((public.prepare_plan_change_for_market('b7200000-0000-4000-8000-000000000009','decouverte','monthly','CI')->>'outcome'),'billing_country_change_requires_support','provider intent blocks market repair');
select is((select billing_country||'|'||currency from public.organization_subscriptions where organization_id='b7200000-0000-4000-8000-000000000009'),'CM|XAF','provider intent case leaves market unchanged');

select is((public.prepare_plan_change_for_market('b7200000-0000-4000-8000-000000000010','decouverte','monthly','CI')->>'outcome'),'billing_country_change_requires_support','provider webhook history blocks market repair');
select is((select billing_country||'|'||currency from public.organization_subscriptions where organization_id='b7200000-0000-4000-8000-000000000010'),'CM|XAF','webhook history case leaves market unchanged');

select is((public.prepare_plan_change_for_market('b7200000-0000-4000-8000-000000000011','decouverte','monthly','CI')->>'outcome'),'billing_country_change_requires_support','commercial intervention blocks market repair');
select is((select billing_country||'|'||currency from public.organization_subscriptions where organization_id='b7200000-0000-4000-8000-000000000011'),'CM|XAF','commercial intervention case leaves market unchanged');

select is((public.prepare_plan_change_for_market('b7200000-0000-4000-8000-000000000012','decouverte','monthly','CI')->>'outcome'),'billing_country_change_requires_support','billing reminder history blocks market repair');
select is((select billing_country||'|'||currency from public.organization_subscriptions where organization_id='b7200000-0000-4000-8000-000000000012'),'CM|XAF','billing reminder case leaves market unchanged');

select is((public.prepare_plan_change_for_market('b7200000-0000-4000-8000-000000000007','decouverte','monthly','CM')->>'outcome'),'unchanged','identical market continues through normal workflow despite history');
select is((select billing_country||'|'||currency from public.organization_subscriptions where organization_id='b7200000-0000-4000-8000-000000000007'),'CM|XAF','identical market remains stable');
select throws_ok($$select public.prepare_plan_change_for_market('b7200000-0000-4000-8000-000000000008','decouverte','monthly','CI')$$,'42501',null,'cross-Organization billing is refused');

reset role;
set local role anon;
select throws_ok($$select public.prepare_plan_change_for_market('b7200000-0000-4000-8000-000000000001','decouverte','monthly','CI')$$,'42501',null,'anon cannot execute guarded billing RPC');
reset role;

select throws_ok($$update public.organization_subscriptions set currency='XAF' where organization_id='b7200000-0000-4000-8000-000000000001'$$,'23514',null,'CI/XAF remains rejected by the closed market constraint');
select is((select count(*) from public.billing_invoices where organization_id::text like 'b7200000-0000-4000-8000-0000000000%'),(select invoices from flow07_v2_before),'RPC creates no invoice');
select is((select count(*) from public.billing_payment_attempts where organization_id::text like 'b7200000-0000-4000-8000-0000000000%'),(select attempts from flow07_v2_before),'RPC creates no payment attempt');
select is((select count(*) from public.billing_events where organization_id::text like 'b7200000-0000-4000-8000-0000000000%'),(select events from flow07_v2_before),'blocked and unchanged workflows create no billing event');
select is((select count(*) from public.billing_provider_intents where organization_id::text like 'b7200000-0000-4000-8000-0000000000%'),(select provider_intents from flow07_v2_before),'RPC creates no provider intent');
select is((select count(*) from public.billing_webhook_events where organization_id::text like 'b7200000-0000-4000-8000-0000000000%'),(select webhook_events from flow07_v2_before),'RPC creates no provider webhook event');
select is((select count(*) from public.commercial_interventions where organization_id::text like 'b7200000-0000-4000-8000-0000000000%'),(select interventions from flow07_v2_before),'RPC creates no commercial intervention');
select is((select count(*) from public.billing_reminder_log where organization_id::text like 'b7200000-0000-4000-8000-0000000000%'),(select reminders from flow07_v2_before),'RPC creates no billing reminder');
select is((select count(*) from public.billing_email_deliveries where organization_id::text like 'b7200000-0000-4000-8000-0000000000%'),(select email_deliveries from flow07_v2_before),'RPC creates no billing email delivery');
select is((select jsonb_object_agg(organization_id::text,billing_country||'|'||currency)
  from public.organization_subscriptions where organization_id in(
   'b7200000-0000-4000-8000-000000000002','b7200000-0000-4000-8000-000000000003',
   'b7200000-0000-4000-8000-000000000004','b7200000-0000-4000-8000-000000000005',
   'b7200000-0000-4000-8000-000000000006','b7200000-0000-4000-8000-000000000009',
   'b7200000-0000-4000-8000-000000000010','b7200000-0000-4000-8000-000000000011',
   'b7200000-0000-4000-8000-000000000012'
  )),(select blocked_markets from flow07_v2_before),'all blocked market pairs equal their before snapshot');
select is((select jsonb_object_agg(organization_id::text,plan)
  from public.organization_plans where organization_id::text like 'b7200000-0000-4000-8000-0000000000%'),
  (select entitlements from flow07_v2_before),'effective entitlements equal their before snapshot');
select is((select count(*) from public.organization_subscriptions where organization_id in(
 'b7200000-0000-4000-8000-000000000002','b7200000-0000-4000-8000-000000000003',
 'b7200000-0000-4000-8000-000000000004','b7200000-0000-4000-8000-000000000005',
 'b7200000-0000-4000-8000-000000000006','b7200000-0000-4000-8000-000000000009',
 'b7200000-0000-4000-8000-000000000010','b7200000-0000-4000-8000-000000000011',
 'b7200000-0000-4000-8000-000000000012') and pending_plan is not null),0::bigint,'blocked subscriptions receive no pending plan');
select is((select count(*) from public.organization_subscriptions where organization_id in(
 'b7200000-0000-4000-8000-000000000002','b7200000-0000-4000-8000-000000000003',
 'b7200000-0000-4000-8000-000000000004','b7200000-0000-4000-8000-000000000005',
 'b7200000-0000-4000-8000-000000000006','b7200000-0000-4000-8000-000000000009',
 'b7200000-0000-4000-8000-000000000010','b7200000-0000-4000-8000-000000000011',
 'b7200000-0000-4000-8000-000000000012') and scheduled_plan is not null),0::bigint,'blocked subscriptions receive no scheduled plan');
select is((select count(*) from public.organization_plans where organization_id::text like 'b7200000-0000-4000-8000-0000000000%' and plan<>'decouverte'),0::bigint,'no paid entitlement is activated');
select is((select count(*) from public.billing_invoices where organization_id='b7200000-0000-4000-8000-000000000001'),0::bigint,'pristine market repair creates no invoice');
select is((select count(*) from public.billing_payment_attempts where organization_id='b7200000-0000-4000-8000-000000000001'),0::bigint,'pristine market repair creates no payment attempt');
select is((select count(*) from public.billing_events where organization_id='b7200000-0000-4000-8000-000000000001'),0::bigint,'pristine unchanged plan request creates no billing event');
select is((select provider_customer_ref from public.organization_subscriptions where organization_id='b7200000-0000-4000-8000-000000000005'),'customer-flow07-v2','blocked provider reference remains unchanged');
select is((select provider_subscription_ref from public.organization_subscriptions where organization_id='b7200000-0000-4000-8000-000000000006'),'subscription-paid-flow07-v2','paid provider subscription reference remains unchanged');

select * from finish();
rollback;
