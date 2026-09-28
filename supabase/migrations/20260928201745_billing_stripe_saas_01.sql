begin;

-- KJORA — BILLING-STRIPE-SAAS-01 — Stripe Test Canada uniquement.
-- Aucun secret ni Price ID dans la base : le mapping fermé vit dans les
-- variables serveur et chaque intention conserve seulement la référence
-- effectivement retenue pour l'audit.

create table if not exists public.billing_provider_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider text not null check (provider = 'stripe'),
  mode text not null default 'sandbox' check (mode = 'sandbox'),
  plan text not null check (plan in ('essentiel','avance','patrimoine')),
  billing_cycle text not null check (billing_cycle in ('monthly','annual')),
  currency text not null check (currency = 'CAD'),
  expected_amount_minor bigint not null check (expected_amount_minor > 0),
  provider_price_ref text not null check (provider_price_ref ~ '^price_[A-Za-z0-9_]+$'),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 255),
  checkout_session_ref text,
  status text not null default 'prepared' check (status in (
    'prepared','checkout_open','paid','payment_failed','grace','cancellation_scheduled',
    'cancelled','refunded'
  )),
  last_provider_event_id text,
  last_provider_event_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, idempotency_key),
  unique (provider, checkout_session_ref)
);

alter table public.billing_provider_intents enable row level security;
revoke all on public.billing_provider_intents from public, anon, authenticated;
grant select, insert, update on public.billing_provider_intents to service_role;

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
  if sub.pending_plan is distinct from p_plan or sub.pending_cycle is distinct from p_cycle then
    raise exception 'pending_intent_mismatch' using errcode = '22023';
  end if;

  select amount_minor into amount from public.billing_prices
   where plan = p_plan and cycle = p_cycle and currency = 'CAD';
  if amount is null or amount <= 0 or sub.pending_amount_minor is distinct from amount then
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

create or replace function public.attach_stripe_test_checkout(
  target_intent_id uuid,
  p_checkout_session_ref text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed uuid;
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.billing_provider_intents i
     set checkout_session_ref = p_checkout_session_ref, status = 'checkout_open', updated_at = now()
   where i.id = target_intent_id
     and private.has_capability(i.organization_id, 'billing.manage')
     and i.status in ('prepared','checkout_open')
     and p_checkout_session_ref ~ '^cs_test_[A-Za-z0-9_]+$'
  returning i.id into changed;
  return changed is not null;
end;
$$;

create or replace function public.process_stripe_test_event(
  p_provider_event_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_intent_key text,
  p_customer_ref text,
  p_subscription_ref text,
  p_payment_status text,
  p_payload_digest text,
  p_provider_status text default null,
  p_cancel_at_period_end boolean default false,
  p_current_period_end timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  intent public.billing_provider_intents%rowtype;
  next_status text;
  event_id uuid;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if p_provider_event_id is null or p_provider_event_id !~ '^evt_[A-Za-z0-9_]+$'
     or p_event_type is null or char_length(p_event_type) not between 3 and 120
     or p_event_created_at is null
     or p_payload_digest is null or p_payload_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_stripe_event' using errcode = '22023';
  end if;

  -- Le journal et l'effet métier vivent dans LA MÊME transaction RPC. Si une
  -- étape suivante échoue, cette insertion est annulée et Stripe peut rejouer
  -- l'événement. Un événement n'est donc jamais "consommé" avant son effet.
  insert into public.billing_webhook_events (
    provider, provider_event_id, event_type, mode, payload_digest,
    signature_verified, disposition
  ) values (
    'stripe', p_provider_event_id, p_event_type, 'sandbox', p_payload_digest,
    true, 'acknowledge_unhandled'
  )
  on conflict (provider, provider_event_id) do nothing
  returning id into event_id;

  if event_id is null then
    return jsonb_build_object('outcome','ignored_duplicate');
  end if;

  if p_intent_key is null then
    update public.billing_webhook_events set
      disposition = 'acknowledge_unhandled', disposition_reason = 'intent_unmatched', processed_at = now()
    where id = event_id;
    return jsonb_build_object('outcome','unmatched');
  end if;

  select * into intent from public.billing_provider_intents
   where provider = 'stripe' and idempotency_key = p_intent_key for update;
  if intent.id is null then
    update public.billing_webhook_events set
      disposition = 'acknowledge_unhandled', disposition_reason = 'intent_unmatched', processed_at = now()
    where id = event_id;
    return jsonb_build_object('outcome','unmatched');
  end if;

  if intent.last_provider_event_created_at is not null
     and p_event_created_at < intent.last_provider_event_created_at then
    update public.billing_webhook_events set
      organization_id = intent.organization_id,
      disposition = 'acknowledge_unhandled', disposition_reason = 'event_out_of_order', processed_at = now()
    where id = event_id;
    return jsonb_build_object('outcome','ignored_out_of_order');
  end if;

  next_status := case
    when p_event_type = 'checkout.session.completed' and p_payment_status = 'paid' then 'paid'
    when p_event_type = 'invoice.payment_failed' then 'payment_failed'
    when p_event_type = 'customer.subscription.updated' and p_cancel_at_period_end then 'cancellation_scheduled'
    when p_event_type = 'customer.subscription.updated' and p_provider_status = 'canceled' then 'cancelled'
    when p_event_type = 'customer.subscription.updated' and p_provider_status in ('past_due','unpaid') then 'payment_failed'
    when p_event_type = 'customer.subscription.updated' and p_provider_status in ('active','trialing')
      and intent.status in ('paid','payment_failed','grace','cancellation_scheduled') then 'paid'
    when p_event_type = 'customer.subscription.deleted' then 'cancelled'
    when p_event_type = 'charge.refunded' then 'refunded'
    else null end;
  if next_status is null then
    update public.billing_webhook_events set
      organization_id = intent.organization_id,
      disposition = 'acknowledge_unhandled', disposition_reason = 'event_type_unhandled', processed_at = now()
    where id = event_id;
    return jsonb_build_object('outcome','acknowledged_unhandled');
  end if;

  update public.billing_provider_intents set
    status = next_status,
    last_provider_event_id = p_provider_event_id,
    last_provider_event_created_at = p_event_created_at,
    updated_at = now()
  where id = intent.id;

  if next_status = 'paid' then
    update public.organization_subscriptions set
      status = 'active', plan = intent.plan, billing_cycle = intent.billing_cycle,
      currency = 'CAD', provider = 'stripe',
      provider_customer_ref = coalesce(p_customer_ref, provider_customer_ref),
      provider_subscription_ref = coalesce(p_subscription_ref, provider_subscription_ref),
      pending_plan = null, pending_cycle = null, pending_amount_minor = null,
      pending_requested_at = null, last_failure_on = null,
      grace_started_on = null, grace_ends_on = null, blocked_at = null,
      cancellation_requested_at = null, cancellation_effective_on = null, cancelled_at = null,
      current_period_end = coalesce(p_current_period_end::date, current_period_end),
      renewal_date = coalesce(p_current_period_end::date, renewal_date)
    where organization_id = intent.organization_id;
    perform private.assign_organization_plan(intent.organization_id, intent.plan);
  elsif next_status = 'payment_failed' then
    update public.organization_subscriptions set status = 'payment_failed', last_failure_on = current_date
     where organization_id = intent.organization_id and status <> 'cancelled';
  elsif next_status = 'cancellation_scheduled' then
    if p_current_period_end is null then
      raise exception 'missing_cancellation_effective_date' using errcode = '22023';
    end if;
    update public.organization_subscriptions set
      status = 'cancellation_scheduled', cancellation_requested_at = now(),
      cancellation_effective_on = p_current_period_end::date,
      current_period_end = p_current_period_end::date, renewal_date = null
    where organization_id = intent.organization_id;
  elsif next_status = 'cancelled' then
    update public.organization_subscriptions set
      status = 'cancelled', cancelled_at = now(), renewal_date = null
     where organization_id = intent.organization_id;
  end if;

  insert into public.billing_events (organization_id, event_type, from_status, to_status, payload)
  values (intent.organization_id, 'stripe_test_' || replace(p_event_type,'.','_'), null, next_status,
          jsonb_build_object('intentId', intent.id, 'providerEventId', p_provider_event_id));

  update public.billing_webhook_events set
    organization_id = intent.organization_id, disposition = 'apply',
    disposition_reason = null, processed_at = now()
  where id = event_id;

  return jsonb_build_object('outcome','applied','status',next_status);
end;
$$;

revoke all on function public.prepare_stripe_test_checkout(uuid,text,text,text,text) from public, anon;
revoke all on function public.attach_stripe_test_checkout(uuid,text) from public, anon;
revoke all on function public.process_stripe_test_event(text,text,timestamptz,text,text,text,text,text,text,boolean,timestamptz) from public, anon, authenticated;
grant execute on function public.prepare_stripe_test_checkout(uuid,text,text,text,text) to authenticated;
grant execute on function public.attach_stripe_test_checkout(uuid,text) to authenticated;
grant execute on function public.process_stripe_test_event(text,text,timestamptz,text,text,text,text,text,text,boolean,timestamptz) to service_role;

commit;
