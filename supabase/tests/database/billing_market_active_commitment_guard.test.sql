begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at) values
 ('d6100000-0000-4000-8000-000000000001','authenticated','authenticated','market-guard-owner@kjora.test',now(),now(),now());

insert into public.organizations(id,created_by) values
 ('d6200000-0000-4000-8000-000000000001','d6100000-0000-4000-8000-000000000001'),
 ('d6200000-0000-4000-8000-000000000002','d6100000-0000-4000-8000-000000000001'),
 ('d6200000-0000-4000-8000-000000000003','d6100000-0000-4000-8000-000000000001'),
 ('d6200000-0000-4000-8000-000000000004','d6100000-0000-4000-8000-000000000001'),
 ('d6200000-0000-4000-8000-000000000005','d6100000-0000-4000-8000-000000000001');

insert into public.memberships(organization_id,user_id,role,status)
select id,'d6100000-0000-4000-8000-000000000001','organization_owner','active'
from public.organizations where id::text like 'd6200000-0000-4000-8000-00000000000%';

insert into public.organization_plans(organization_id,plan)
select id,'decouverte' from public.organizations where id::text like 'd6200000-0000-4000-8000-00000000000%'
on conflict (organization_id) do update set plan=excluded.plan;

insert into public.organization_subscriptions(organization_id,status,plan,billing_country,currency) values
 ('d6200000-0000-4000-8000-000000000001','free','decouverte','CM','XAF'),
 ('d6200000-0000-4000-8000-000000000002','free','decouverte','CM','XAF'),
 ('d6200000-0000-4000-8000-000000000003','active','essentiel','CM','XAF'),
 ('d6200000-0000-4000-8000-000000000004','free','decouverte','CM','XAF'),
 ('d6200000-0000-4000-8000-000000000005','free','decouverte','CM','XAF');

-- Org 1 deliberately has historical audit only. It remains immutable.
insert into public.billing_events(id,organization_id,event_type) values
 ('d6300000-0000-4000-8000-000000000001','d6200000-0000-4000-8000-000000000001','historical_xaf_audit');
insert into public.commercial_interventions(
 id,organization_id,intervention_type,reason_code,admin_note,granted_plan,starts_on,ends_on,status,created_by,idempotency_key
) values (
 'd6400000-0000-4000-8000-000000000001','d6200000-0000-4000-8000-000000000001',
 'complimentary','sales_gift','Expired historical audit remains immutable','avance',current_date - 31,current_date - 1,'expired',
 'd6100000-0000-4000-8000-000000000001','market-guard-expired-audit-001'
);

update public.organization_subscriptions
   set pending_plan='avance',pending_cycle='monthly',pending_amount_minor=12900,pending_requested_at=now()
 where organization_id='d6200000-0000-4000-8000-000000000002';

insert into public.billing_provider_intents(
 id,organization_id,provider,mode,plan,billing_cycle,currency,expected_amount_minor,provider_price_ref,idempotency_key,status
) values (
 'd6500000-0000-4000-8000-000000000004','d6200000-0000-4000-8000-000000000004',
 'stripe','live','avance','monthly','CAD',3199,'price_market_guard_004','market-guard-provider-intent-004','checkout_open'
);

insert into public.commercial_interventions(
 id,organization_id,intervention_type,reason_code,admin_note,granted_plan,starts_on,ends_on,status,created_by,idempotency_key
) values (
 'd6400000-0000-4000-8000-000000000005','d6200000-0000-4000-8000-000000000005',
 'complimentary','sales_gift','Active commercial commitment blocks market change','avance',current_date,current_date + 31,'active',
 'd6100000-0000-4000-8000-000000000001','market-guard-active-commercial-005'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"d6100000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
 (public.prepare_plan_change_for_market('d6200000-0000-4000-8000-000000000001','avance','monthly','CA')->>'outcome'),
 'upgrade_intent_recorded',
 'free subscription with historical XAF audit can move to Canada'
);
select is(
 (select billing_country||'|'||currency from public.organization_subscriptions where organization_id='d6200000-0000-4000-8000-000000000001'),
 'CA|CAD',
 'successful market change stores Canada and CAD'
);
select is(
 (select pending_amount_minor from public.organization_subscriptions where organization_id='d6200000-0000-4000-8000-000000000001'),
 3199::bigint,
 'Advanced monthly CAD catalog amount is 31.99 CAD'
);
select is(
 (public.prepare_plan_change_for_market('d6200000-0000-4000-8000-000000000002','avance','monthly','CA')->>'outcome'),
 'billing_market_change_blocked',
 'active XAF plan request blocks market change'
);
select is(
 (public.prepare_plan_change_for_market('d6200000-0000-4000-8000-000000000002','avance','monthly','CA')->'blockers'->>0),
 'active_plan_change',
 'active request receives a precise blocker'
);
select is(
 (public.prepare_plan_change_for_market('d6200000-0000-4000-8000-000000000003','avance','monthly','CA')->>'outcome'),
 'billing_market_change_blocked',
 'active subscription blocks market change'
);
select is(
 (public.prepare_plan_change_for_market('d6200000-0000-4000-8000-000000000003','avance','monthly','CA')->'blockers'->>0),
 'active_subscription',
 'active subscription receives a precise blocker'
);
select is(
 (public.prepare_plan_change_for_market('d6200000-0000-4000-8000-000000000004','avance','monthly','CA')->>'outcome'),
 'billing_market_change_blocked',
 'open Checkout intent blocks market change'
);
select is(
 (public.prepare_plan_change_for_market('d6200000-0000-4000-8000-000000000004','avance','monthly','CA')->'blockers'->>0),
 'open_checkout',
 'open Checkout receives a precise blocker'
);
select is(
 (public.prepare_plan_change_for_market('d6200000-0000-4000-8000-000000000005','avance','monthly','CA')->>'outcome'),
 'billing_market_change_blocked',
 'active commercial intervention blocks market change'
);
select is(
 (public.prepare_plan_change_for_market('d6200000-0000-4000-8000-000000000005','avance','monthly','CA')->'blockers'->>0),
 'active_commercial_intervention',
 'active commercial intervention receives a precise blocker'
);

reset role;
select is(
 (select count(*) from public.commercial_interventions where organization_id='d6200000-0000-4000-8000-000000000001'),
 1::bigint,
 'historical commercial audit is retained'
);

select * from finish();
rollback;
