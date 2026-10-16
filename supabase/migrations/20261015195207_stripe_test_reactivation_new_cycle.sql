-- KJORA — Stripe Test reactivation starts a fresh, full billing cycle.
-- Additive correction: historical migrations remain unchanged.

begin;

create or replace function public.prepare_stripe_test_checkout(
  target_organization_id uuid,
  p_plan text,
  p_cycle text,
  p_price_ref text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub public.organization_subscriptions%rowtype;
  amount bigint;
  intent public.billing_provider_intents%rowtype;
begin
  if (select auth.uid()) is null or not private.has_capability(target_organization_id, 'billing.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations where id = target_organization_id and status = 'active') then
    raise exception 'organization_not_active' using errcode = '42501';
  end if;
  if p_plan not in ('essentiel','avance','patrimoine') or p_cycle not in ('monthly','annual') then
    raise exception 'invalid_plan_or_cycle' using errcode = '22023';
  end if;
  if p_price_ref is null or p_price_ref !~ '^price_[A-Za-z0-9_]+$'
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 255 then
    raise exception 'invalid_provider_reference' using errcode = '22023';
  end if;

  select * into sub from public.organization_subscriptions
   where organization_id = target_organization_id for update;
  if sub.organization_id is null or sub.billing_country <> 'CA' or sub.currency <> 'CAD' then
    raise exception 'stripe_canada_only' using errcode = '22023';
  end if;

  select amount_minor into amount from public.billing_prices
   where plan = p_plan and cycle = p_cycle and currency = 'CAD';
  if amount is null or amount <= 0 then
    raise exception 'catalog_amount_mismatch' using errcode = '22023';
  end if;

  -- A cancelled subscription has no remaining paid service to credit. Once the
  -- user explicitly requested reactivation, Stripe must therefore start a new
  -- cycle at the full server-side catalog amount. This also replaces a stale
  -- plan/cycle intent atomically under the subscription row lock.
  if sub.status = 'reactivation_pending' then
    update public.organization_subscriptions
       set pending_plan = p_plan,
           pending_cycle = p_cycle,
           pending_amount_minor = amount,
           pending_requested_at = now()
     where organization_id = target_organization_id;
  elsif sub.pending_plan is distinct from p_plan
     or sub.pending_cycle is distinct from p_cycle then
    raise exception 'pending_intent_mismatch' using errcode = '22023';
  elsif sub.pending_amount_minor is distinct from amount then
    raise exception 'catalog_amount_mismatch' using errcode = '22023';
  end if;

  insert into public.billing_provider_intents (
    organization_id, provider, plan, billing_cycle, currency,
    expected_amount_minor, provider_price_ref, idempotency_key
  ) values (
    target_organization_id, 'stripe', p_plan, p_cycle, 'CAD', amount, p_price_ref, p_idempotency_key
  ) on conflict (organization_id, provider, idempotency_key) do update
    set updated_at = now()
    where public.billing_provider_intents.plan = excluded.plan
      and public.billing_provider_intents.billing_cycle = excluded.billing_cycle
      and public.billing_provider_intents.expected_amount_minor = excluded.expected_amount_minor
      and public.billing_provider_intents.provider_price_ref = excluded.provider_price_ref
  returning * into intent;

  if intent.id is null then raise exception 'idempotency_conflict' using errcode = '23505'; end if;
  return jsonb_build_object(
    'intentId', intent.id, 'idempotencyKey', intent.idempotency_key,
    'amountMinor', intent.expected_amount_minor, 'currency', intent.currency,
    'customerRef', sub.provider_customer_ref
  );
end;
$$;

revoke all on function public.prepare_stripe_test_checkout(uuid,text,text,text,text) from public, anon;
grant execute on function public.prepare_stripe_test_checkout(uuid,text,text,text,text) to authenticated;

commit;
