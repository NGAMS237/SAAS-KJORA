begin;

-- COUNTRY-BILLING-WHATSAPP-FLOW-FIX-07
-- Additive repair only. Rental currency remains in organization_profiles;
-- SaaS billing currency remains in organization_subscriptions. No conversion.

alter table public.onboarding_states
  drop constraint if exists onboarding_states_billing_country_intent_check,
  add constraint onboarding_states_billing_country_intent_check
    check (billing_country_intent is null or billing_country_intent in ('CA','CM','CI'));

alter table public.billing_prices
  drop constraint if exists billing_prices_currency_check,
  add constraint billing_prices_currency_check check (currency in ('XAF','XOF','CAD'));

alter table public.organization_subscriptions
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
   and s.provider is null and s.provider_subscription_ref is null
   and not exists(select 1 from public.billing_invoices i where i.organization_id=s.organization_id)
   and not exists(select 1 from public.billing_payment_attempts a where a.organization_id=s.organization_id)
   and not exists(select 1 from public.billing_events e where e.organization_id=s.organization_id);

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
declare sub public.organization_subscriptions;target_currency text;result jsonb;
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
 elsif sub.status<>'free' and (sub.billing_country<>target_billing_country or sub.currency<>target_currency) then
  return jsonb_build_object('outcome','billing_country_change_requires_support','billingCountry',sub.billing_country,'currency',sub.currency);
 elsif sub.status='free' then
  update public.organization_subscriptions set billing_country=target_billing_country,currency=target_currency
   where organization_id=target_organization_id;
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
