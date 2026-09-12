begin;

-- SITE-APP-FLOW-01.1 — durable commercial intent and SaaS billing market.
-- This migration deliberately leaves organization_profiles.currency_code
-- untouched: that currency describes rental operations, not the KJORA
-- subscription.

alter table public.onboarding_states
  add column if not exists billing_cycle_intent text
    check (billing_cycle_intent is null or billing_cycle_intent in ('monthly', 'annual')),
  add column if not exists billing_country_intent text
    check (billing_country_intent is null or billing_country_intent in ('CA', 'CM')),
  add column if not exists locale_intent text
    check (locale_intent is null or locale_intent in ('fr', 'en')),
  add column if not exists source_intent text
    check (source_intent is null or source_intent = 'site'),
  add column if not exists intent_status text not null default 'active'
    check (intent_status in ('active', 'prepared'));

comment on column public.onboarding_states.billing_country_intent is
  'SaaS subscription billing market. Independent from rental/Organization country and currency.';
comment on column public.onboarding_states.intent_status is
  'active = resumable commercial intent; prepared = explicitly handled by the Billing flow.';

grant select (
  billing_cycle_intent, billing_country_intent, locale_intent,
  source_intent, intent_status
) on public.onboarding_states to authenticated;

-- Existing subscriptions keep their actual currency. The country is derived
-- once during migration (CAD -> CA, otherwise CM), then becomes explicit.
alter table public.organization_subscriptions
  add column if not exists billing_country text;

update public.organization_subscriptions
   set billing_country = case when currency = 'CAD' then 'CA' else 'CM' end
 where billing_country is null;

alter table public.organization_subscriptions
  alter column billing_country set default 'CM',
  alter column billing_country set not null,
  drop constraint if exists organization_subscriptions_billing_country_check,
  add constraint organization_subscriptions_billing_country_check
    check (billing_country in ('CA', 'CM')),
  drop constraint if exists organization_subscriptions_billing_market_currency_check,
  add constraint organization_subscriptions_billing_market_currency_check
    check (
      (billing_country = 'CA' and currency = 'CAD')
      or (billing_country = 'CM' and currency = 'XAF')
    );

comment on column public.organization_subscriptions.billing_country is
  'SaaS billing country: CA maps to CAD and CM maps to XAF. Unrelated to rental currency.';

-- The read RPC keeps its signature and adds only controlled intent fields.
create or replace function public.get_onboarding_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  st public.onboarding_states;
begin
  if current_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into st from public.onboarding_states where user_id = current_user_id;

  if not found then
    return jsonb_build_object(
      'exists', false, 'step', 'plan_intent', 'plan_intent', null,
      'billing_cycle_intent', null, 'billing_country_intent', null,
      'locale_intent', null, 'source_intent', null, 'intent_status', 'active',
      'rent_collection_method', null, 'organization_id', null,
      'first_property_id', null, 'first_unit_id', null, 'completed_at', null
    );
  end if;

  return jsonb_build_object(
    'exists', true, 'step', st.step, 'plan_intent', st.plan_intent,
    'billing_cycle_intent', st.billing_cycle_intent,
    'billing_country_intent', st.billing_country_intent,
    'locale_intent', st.locale_intent, 'source_intent', st.source_intent,
    'intent_status', st.intent_status,
    'rent_collection_method', st.rent_collection_method,
    'organization_id', st.organization_id,
    'first_property_id', st.first_property_id,
    'first_unit_id', st.first_unit_id, 'completed_at', st.completed_at
  );
end;
$$;

revoke all on function public.get_onboarding_state() from public, anon;
grant execute on function public.get_onboarding_state() to authenticated;

-- Replacement rule: a valid plan+cycle selection replaces all fields
-- atomically. billing_country may remain null only while the explicit in-app
-- choice is pending; an invalid country is always rejected.
create or replace function public.replace_site_app_intent(
  target_plan text,
  target_cycle text,
  target_billing_country text,
  target_locale text,
  target_source text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if target_plan is null
     or target_plan not in ('decouverte','essentiel','avance','patrimoine','sur_mesure')
     or target_cycle is null
     or target_cycle not in ('monthly','annual')
     or (target_billing_country is not null and target_billing_country not in ('CA','CM'))
     or target_locale is null
     or target_locale not in ('fr','en')
     or (target_source is not null and target_source <> 'site') then
    raise exception 'invalid_site_app_intent' using errcode = '22023';
  end if;

  insert into public.onboarding_states as os (
    user_id, plan_intent, billing_cycle_intent, billing_country_intent,
    locale_intent, source_intent, intent_status
  ) values (
    current_user_id, target_plan, target_cycle, target_billing_country,
    target_locale, target_source, 'active'
  )
  on conflict (user_id) do update set
    plan_intent = excluded.plan_intent,
    billing_cycle_intent = excluded.billing_cycle_intent,
    billing_country_intent = excluded.billing_country_intent,
    locale_intent = excluded.locale_intent,
    source_intent = excluded.source_intent,
    intent_status = 'active';

  return public.get_onboarding_state();
end;
$$;

revoke all on function public.replace_site_app_intent(text, text, text, text, text)
  from public, anon;
grant execute on function public.replace_site_app_intent(text, text, text, text, text)
  to authenticated;

-- The client submits a country, never a currency. This function maps the
-- country server-side, then delegates the existing quote/intention logic.
-- During the pilot a market change is allowed only while the subscription is
-- free; a paid subscription requires a later, dedicated support workflow.
create or replace function public.prepare_plan_change_for_market(
  target_organization_id uuid,
  target_plan text,
  target_cycle text,
  target_billing_country text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub public.organization_subscriptions;
  target_currency text;
  result jsonb;
begin
  if not private.has_capability(target_organization_id, 'billing.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_plan is null
     or target_plan not in ('decouverte','essentiel','avance','patrimoine')
     or target_cycle is null
     or target_cycle not in ('monthly','annual')
     or target_billing_country is null
     or target_billing_country not in ('CA','CM') then
    raise exception 'invalid_plan_change' using errcode = '22023';
  end if;

  target_currency := case target_billing_country when 'CA' then 'CAD' else 'XAF' end;

  -- Serialize the first subscription creation as well as later market changes.
  -- A SELECT ... FOR UPDATE on an absent subscription row cannot lock that
  -- absence; the parent Organization row is the stable lock for both cases.
  perform 1 from public.organizations
   where id = target_organization_id for update;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into sub from public.organization_subscriptions
   where organization_id = target_organization_id for update;

  if sub.organization_id is null then
    insert into public.organization_subscriptions (
      organization_id, billing_country, currency
    ) values (
      target_organization_id, target_billing_country, target_currency
    ) returning * into sub;
  elsif sub.status <> 'free'
    and (sub.billing_country <> target_billing_country or sub.currency <> target_currency) then
    return jsonb_build_object(
      'outcome', 'billing_country_change_requires_support',
      'billingCountry', sub.billing_country, 'currency', sub.currency
    );
  elsif sub.status = 'free' then
    update public.organization_subscriptions
       set billing_country = target_billing_country,
           currency = target_currency
     where organization_id = target_organization_id;
  end if;

  result := public.request_plan_change(target_organization_id, target_plan, target_cycle);

  update public.onboarding_states
     set intent_status = 'prepared'
   where user_id = (select auth.uid())
     and plan_intent = target_plan
     and billing_cycle_intent = target_cycle
     and billing_country_intent = target_billing_country;

  return result || jsonb_build_object(
    'billingCountry', target_billing_country,
    'currency', target_currency
  );
end;
$$;

revoke all on function public.prepare_plan_change_for_market(uuid, text, text, text)
  from public, anon;
grant execute on function public.prepare_plan_change_for_market(uuid, text, text, text)
  to authenticated;

comment on function public.prepare_plan_change_for_market(uuid, text, text, text) is
  'Prepares a subscription change from a server-validated billing country. Never activates a paid plan.';

commit;
