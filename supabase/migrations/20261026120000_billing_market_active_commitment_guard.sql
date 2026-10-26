begin;

-- KJORA — BILLING-MARKET-ACTIVE-COMMITMENT-GUARD
--
-- A market change must protect an active financial commitment, not turn the
-- immutable audit trail into a permanent lock.  This migration deliberately
-- keeps billing_events, completed/void audit rows, and inactive commercial
-- interventions untouched.

create or replace function public.prepare_plan_change_for_market(
  target_organization_id uuid,
  target_plan text,
  target_cycle text,
  target_billing_country text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub public.organization_subscriptions;
  target_currency text;
  result jsonb;
  market_change_requested boolean;
  blockers jsonb := '[]'::jsonb;
begin
  if (select auth.uid()) is null
     or not private.has_capability(target_organization_id, 'billing.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if target_plan is null or target_plan not in ('decouverte','essentiel','avance','patrimoine')
     or target_cycle is null or target_cycle not in ('monthly','annual')
     or target_billing_country is null or target_billing_country not in ('CA','CM','CI') then
    raise exception 'invalid_plan_change' using errcode = '22023';
  end if;

  target_currency := case target_billing_country
    when 'CA' then 'CAD' when 'CI' then 'XOF' else 'XAF' end;

  perform 1 from public.organizations where id = target_organization_id for update;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into sub from public.organization_subscriptions
   where organization_id = target_organization_id for update;
  if sub.organization_id is null then
    insert into public.organization_subscriptions(organization_id,billing_country,currency)
    values(target_organization_id,target_billing_country,target_currency) returning * into sub;
  else
    market_change_requested := sub.billing_country is distinct from target_billing_country
      or sub.currency is distinct from target_currency;

    if market_change_requested then
      if sub.status in ('active','payment_failed','grace','billing_blocked',
                        'cancellation_scheduled','reactivation_pending') then
        blockers := blockers || jsonb_build_array('active_subscription');
      end if;

      if sub.pending_plan is not null or sub.pending_cycle is not null
         or sub.pending_amount_minor is not null or sub.pending_requested_at is not null
         or sub.scheduled_plan is not null or sub.scheduled_cycle is not null
         or sub.scheduled_effective_on is not null then
        blockers := blockers || jsonb_build_array('active_plan_change');
      end if;

      if exists (
        select 1 from public.billing_provider_intents pi
        where pi.organization_id = target_organization_id
          and pi.status in ('prepared','checkout_open')
      ) then
        blockers := blockers || jsonb_build_array('open_checkout');
      end if;

      if exists (
        select 1 from public.billing_provider_intents pi
        where pi.organization_id = target_organization_id
          and pi.status = 'refunded'
      ) then
        blockers := blockers || jsonb_build_array('refund_review_required');
      end if;

      if exists (
        select 1 from public.billing_invoices i
        where i.organization_id = target_organization_id
          and i.generation_source = 'provider'
          and i.status in ('draft','open','uncollectible')
      ) or exists (
        select 1 from public.billing_payment_attempts a
        where a.organization_id = target_organization_id
          and a.provider_attempt_ref is not null
          and a.status in ('scheduled','failed')
      ) then
        blockers := blockers || jsonb_build_array('provider_payment_in_progress');
      end if;

      if exists (
        select 1 from public.commercial_interventions ci
        where ci.organization_id = target_organization_id
          and ci.status = 'active'
          and (ci.ends_on is null or ci.ends_on >= current_date)
      ) then
        blockers := blockers || jsonb_build_array('active_commercial_intervention');
      end if;

      if jsonb_array_length(blockers) > 0 then
        return jsonb_build_object(
          'outcome','billing_market_change_blocked',
          'billingCountry',sub.billing_country,
          'currency',sub.currency,
          'blockers',blockers
        );
      end if;

      update public.organization_subscriptions
         set billing_country = target_billing_country,
             currency = target_currency
       where organization_id = target_organization_id;
    end if;
  end if;

  result := public.request_plan_change(target_organization_id,target_plan,target_cycle);
  update public.onboarding_states set intent_status = 'prepared'
   where user_id = (select auth.uid()) and plan_intent = target_plan
     and billing_cycle_intent = target_cycle
     and billing_country_intent = target_billing_country;
  return result || jsonb_build_object(
    'billingCountry',target_billing_country,'currency',target_currency
  );
end;
$$;

revoke all on function public.prepare_plan_change_for_market(uuid,text,text,text) from public, anon;
grant execute on function public.prepare_plan_change_for_market(uuid,text,text,text) to authenticated;

comment on function public.prepare_plan_change_for_market(uuid,text,text,text) is
  'Changes the SaaS billing market only when no active financial commitment exists. Historical audit records remain immutable and do not block a new market.';

commit;
