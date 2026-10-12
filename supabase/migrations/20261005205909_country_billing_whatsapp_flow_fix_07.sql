begin;

-- COUNTRY-BILLING-WHATSAPP-FLOW-FIX-07
-- Additive repair only. Rental currency remains in organization_profiles;
-- SaaS billing currency remains in organization_subscriptions. No conversion.

-- The SITE-APP-FLOW ephemeral rebuild deliberately holds back the original
-- Canada intent migration. Bootstrap every column FLOW-07 consumes so this
-- migration remains independently replayable on a fresh database. Existing
-- values are preserved; only missing/null state receives the historical safe
-- defaults used by the held-back migration.
alter table public.onboarding_states
  add column if not exists billing_cycle_intent text,
  add column if not exists billing_country_intent text,
  add column if not exists locale_intent text,
  add column if not exists source_intent text,
  add column if not exists intent_status text not null default 'active';

update public.onboarding_states
   set intent_status = 'active'
 where intent_status is null;

alter table public.onboarding_states
  alter column intent_status set default 'active',
  alter column intent_status set not null,
  drop constraint if exists onboarding_states_billing_cycle_intent_check,
  add constraint onboarding_states_billing_cycle_intent_check
    check (billing_cycle_intent is null or billing_cycle_intent in ('monthly','annual')),
  drop constraint if exists onboarding_states_billing_country_intent_check,
  add constraint onboarding_states_billing_country_intent_check
    check (billing_country_intent is null or billing_country_intent in ('CA','CM','CI')),
  drop constraint if exists onboarding_states_locale_intent_check,
  add constraint onboarding_states_locale_intent_check
    check (locale_intent is null or locale_intent in ('fr','en')),
  drop constraint if exists onboarding_states_source_intent_check,
  add constraint onboarding_states_source_intent_check
    check (source_intent is null or source_intent='site'),
  drop constraint if exists onboarding_states_intent_status_check,
  add constraint onboarding_states_intent_status_check
    check (intent_status in ('active','prepared'));

alter table public.billing_prices
  drop constraint if exists billing_prices_currency_check,
  add constraint billing_prices_currency_check check (currency in ('XAF','XOF','CAD'));

alter table public.organization_subscriptions
  add column if not exists billing_country text;

update public.organization_subscriptions
   set billing_country = case currency
     when 'CAD' then 'CA'
     when 'XOF' then 'CI'
     else 'CM'
   end
 where billing_country is null;

alter table public.organization_subscriptions
  alter column billing_country set default 'CM',
  alter column billing_country set not null,
  drop constraint if exists organization_subscriptions_currency_check,
  add constraint organization_subscriptions_currency_check check (currency in ('XAF','XOF','CAD')),
  drop constraint if exists organization_subscriptions_billing_country_check,
  add constraint organization_subscriptions_billing_country_check check (billing_country in ('CA','CM','CI')),
  drop constraint if exists organization_subscriptions_billing_market_currency_check,
  add constraint organization_subscriptions_billing_market_currency_check check (
    (billing_country='CA' and currency='CAD') or
    (billing_country='CM' and currency='XAF') or
    (billing_country='CI' and currency='XOF')
  );

alter table public.billing_invoices
  drop constraint if exists billing_invoices_currency_check,
  add constraint billing_invoices_currency_check check (currency in ('XAF','XOF','CAD'));

insert into public.billing_prices(plan,cycle,currency,amount_minor) values
 ('decouverte','monthly','XOF',0),('decouverte','annual','XOF',0),
 ('essentiel','monthly','XOF',5900),('essentiel','annual','XOF',59000),
 ('avance','monthly','XOF',12900),('avance','annual','XOF',129000),
 ('patrimoine','monthly','XOF',24900),('patrimoine','annual','XOF',249000),
 ('sur_mesure','monthly','XOF',null),('sur_mesure','annual','XOF',null)
on conflict(plan,cycle,currency) do update set amount_minor=excluded.amount_minor;

-- Correct only a pristine free CI subscription. Any billing history keeps its
-- previous value for supervised review; no financial record is rewritten.
update public.organization_subscriptions s
   set billing_country='CI', currency='XOF'
  from public.organization_profiles p
 where p.organization_id=s.organization_id
   and p.country_code='CI'
   and s.status='free' and s.plan='decouverte'
   and s.provider is null
   and s.provider_customer_ref is null
   and s.provider_subscription_ref is null
   and s.current_period_start is null
   and s.current_period_end is null
   and s.renewal_date is null
   and s.last_failure_on is null
   and s.grace_started_on is null
   and s.grace_ends_on is null
   and s.blocked_at is null
   and s.cancellation_requested_at is null
   and s.cancellation_effective_on is null
   and s.cancelled_at is null
   and s.scheduled_plan is null
   and s.scheduled_cycle is null
   and s.scheduled_effective_on is null
   and s.pending_plan is null
   and s.pending_cycle is null
   and s.pending_amount_minor is null
   and s.pending_requested_at is null
   and s.payment_method_brand is null
   and s.payment_method_last4 is null
   and s.payment_method_expires_on is null
   and not exists(select 1 from public.billing_invoices i where i.organization_id=s.organization_id)
   and not exists(select 1 from public.billing_payment_attempts a where a.organization_id=s.organization_id)
   and not exists(select 1 from public.billing_events e where e.organization_id=s.organization_id)
   and not exists(select 1 from public.billing_provider_intents pi where pi.organization_id=s.organization_id)
   and not exists(select 1 from public.billing_webhook_events we where we.organization_id=s.organization_id)
   and not exists(select 1 from public.commercial_interventions ci where ci.organization_id=s.organization_id)
   and not exists(select 1 from public.billing_reminder_log rl where rl.organization_id=s.organization_id);

comment on column public.organization_subscriptions.billing_country is
 'SaaS billing country: CA/CAD, CM/XAF or CI/XOF. Independent from rental currency.';

create or replace function public.replace_site_app_intent(
 target_plan text,target_cycle text,target_billing_country text,target_locale text,target_source text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid := (select auth.uid());
begin
 if current_user_id is null then raise exception 'unauthenticated' using errcode='42501'; end if;
 if target_plan is null or target_plan not in ('decouverte','essentiel','avance','patrimoine','sur_mesure')
  or target_cycle is null or target_cycle not in ('monthly','annual')
  or (target_billing_country is not null and target_billing_country not in ('CA','CM','CI'))
  or target_locale is null or target_locale not in ('fr','en')
  or (target_source is not null and target_source<>'site') then
   raise exception 'invalid_site_app_intent' using errcode='22023';
 end if;
 insert into public.onboarding_states as os(user_id,plan_intent,billing_cycle_intent,billing_country_intent,locale_intent,source_intent,intent_status)
 values(current_user_id,target_plan,target_cycle,target_billing_country,target_locale,target_source,'active')
 on conflict(user_id) do update set plan_intent=excluded.plan_intent,billing_cycle_intent=excluded.billing_cycle_intent,
  billing_country_intent=excluded.billing_country_intent,locale_intent=excluded.locale_intent,source_intent=excluded.source_intent,intent_status='active';
 return public.get_onboarding_state();
end;$$;
revoke all on function public.replace_site_app_intent(text,text,text,text,text) from public,anon;
grant execute on function public.replace_site_app_intent(text,text,text,text,text) to authenticated;

create or replace function public.prepare_plan_change_for_market(
 target_organization_id uuid,target_plan text,target_cycle text,target_billing_country text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 sub public.organization_subscriptions;
 target_currency text;
 result jsonb;
 market_change_requested boolean;
 subscription_pristine boolean;
begin
 if (select auth.uid()) is null or not private.has_capability(target_organization_id,'billing.manage') then
  raise exception 'forbidden' using errcode='42501';
 end if;
 if target_plan is null or target_plan not in ('decouverte','essentiel','avance','patrimoine')
  or target_cycle is null or target_cycle not in ('monthly','annual')
  or target_billing_country is null or target_billing_country not in ('CA','CM','CI') then
  raise exception 'invalid_plan_change' using errcode='22023';
 end if;
 target_currency:=case target_billing_country when 'CA' then 'CAD' when 'CI' then 'XOF' else 'XAF' end;
 perform 1 from public.organizations where id=target_organization_id for update;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 select * into sub from public.organization_subscriptions where organization_id=target_organization_id for update;
 if sub.organization_id is null then
  insert into public.organization_subscriptions(organization_id,billing_country,currency)
  values(target_organization_id,target_billing_country,target_currency) returning * into sub;
 else
  market_change_requested := sub.billing_country is distinct from target_billing_country
    or sub.currency is distinct from target_currency;

  if market_change_requested then
   subscription_pristine := sub.status='free'
    and sub.plan='decouverte'
    and sub.provider is null
    and sub.provider_customer_ref is null
    and sub.provider_subscription_ref is null
    and sub.current_period_start is null
    and sub.current_period_end is null
    and sub.renewal_date is null
    and sub.last_failure_on is null
    and sub.grace_started_on is null
    and sub.grace_ends_on is null
    and sub.blocked_at is null
    and sub.cancellation_requested_at is null
    and sub.cancellation_effective_on is null
    and sub.cancelled_at is null
    and sub.scheduled_plan is null
    and sub.scheduled_cycle is null
    and sub.scheduled_effective_on is null
    and sub.pending_plan is null
    and sub.pending_cycle is null
    and sub.pending_amount_minor is null
    and sub.pending_requested_at is null
    and sub.payment_method_brand is null
    and sub.payment_method_last4 is null
    and sub.payment_method_expires_on is null
    and not exists(select 1 from public.billing_invoices i where i.organization_id=target_organization_id)
    and not exists(select 1 from public.billing_payment_attempts a where a.organization_id=target_organization_id)
    and not exists(select 1 from public.billing_events e where e.organization_id=target_organization_id)
    and not exists(select 1 from public.billing_provider_intents pi where pi.organization_id=target_organization_id)
    and not exists(select 1 from public.billing_webhook_events we where we.organization_id=target_organization_id)
    and not exists(select 1 from public.commercial_interventions ci where ci.organization_id=target_organization_id)
    and not exists(select 1 from public.billing_reminder_log rl where rl.organization_id=target_organization_id);

   if not subscription_pristine then
    return jsonb_build_object(
     'outcome','billing_country_change_requires_support',
     'billingCountry',sub.billing_country,
     'currency',sub.currency
    );
   end if;

   update public.organization_subscriptions
      set billing_country=target_billing_country,currency=target_currency
    where organization_id=target_organization_id;
  end if;
 end if;
 result:=public.request_plan_change(target_organization_id,target_plan,target_cycle);
 update public.onboarding_states set intent_status='prepared'
  where user_id=(select auth.uid()) and plan_intent=target_plan and billing_cycle_intent=target_cycle
   and billing_country_intent=target_billing_country;
 return result||jsonb_build_object('billingCountry',target_billing_country,'currency',target_currency);
end;$$;
revoke all on function public.prepare_plan_change_for_market(uuid,text,text,text) from public,anon;
grant execute on function public.prepare_plan_change_for_market(uuid,text,text,text) to authenticated;

create or replace function public.get_tenant_whatsapp_summary(target_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pref public.tenant_communication_preferences; tenant_org uuid;
begin
 select organization_id into tenant_org from public.tenants where id=target_tenant_id;
 if (select auth.uid()) is null or tenant_org is null or not private.has_capability(tenant_org,'tenant.manage') then
  raise exception 'forbidden' using errcode='42501';
 end if;
 select * into pref from public.tenant_communication_preferences
  where tenant_id=target_tenant_id and organization_id=tenant_org;
 if pref.tenant_id is null then return jsonb_build_object('exists',false); end if;
 return jsonb_build_object(
  'exists',true,'countryCode',pref.country_code,'maskedPhone','••••'||right(pref.national_number,2),
  'whatsappStatus',pref.whatsapp_status,'preferredChannel',pref.preferred_channel,
  'serviceConsent',pref.whatsapp_transactional_consented_at is not null and pref.whatsapp_transactional_revoked_at is null,
  'marketingConsent',pref.whatsapp_marketing_consented_at is not null and pref.whatsapp_marketing_revoked_at is null
 );
end;$$;
revoke all on function public.get_tenant_whatsapp_summary(uuid) from public,anon;
grant execute on function public.get_tenant_whatsapp_summary(uuid) to authenticated;

commit;
