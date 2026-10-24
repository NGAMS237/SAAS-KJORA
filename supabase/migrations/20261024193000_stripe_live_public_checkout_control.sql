begin;

-- A database-side boundary is required because authenticated users can call
-- prepare_stripe_checkout directly.  The Hostinger flag selects application
-- mode; this control decides whether the database enforces the private-pilot
-- allowlist.  It defaults closed and is changed only by a platform admin.
create table if not exists public.billing_runtime_controls (
  singleton boolean primary key default true check (singleton),
  stripe_live_invite_only boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict
);

insert into public.billing_runtime_controls (singleton, stripe_live_invite_only)
values (true, true)
on conflict (singleton) do nothing;

alter table public.billing_runtime_controls enable row level security;
revoke all on public.billing_runtime_controls from public, anon, authenticated;
grant select, insert, update on public.billing_runtime_controls to service_role;

create or replace function public.stripe_live_checkout_invite_only()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select stripe_live_invite_only
    from public.billing_runtime_controls
    where singleton = true
  ), true);
$$;

revoke all on function public.stripe_live_checkout_invite_only() from public, anon;
grant execute on function public.stripe_live_checkout_invite_only() to authenticated;

create or replace function public.admin_set_stripe_live_invite_only(target_invite_only boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  insert into public.billing_runtime_controls (singleton, stripe_live_invite_only, updated_at, updated_by)
  values (true, target_invite_only, now(), (select auth.uid()))
  on conflict (singleton) do update set
    stripe_live_invite_only = excluded.stripe_live_invite_only,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;
  return true;
end;
$$;

revoke all on function public.admin_set_stripe_live_invite_only(boolean) from public, anon;
grant execute on function public.admin_set_stripe_live_invite_only(boolean) to authenticated;

create or replace function public.prepare_stripe_checkout(
  target_organization_id uuid,
  p_plan text,
  p_cycle text,
  p_price_ref text,
  p_idempotency_key text,
  p_mode text
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
  if p_mode not in ('sandbox','live') then
    raise exception 'invalid_provider_mode' using errcode = '22023';
  end if;
  if p_mode = 'live' and public.stripe_live_checkout_invite_only()
     and not public.paid_pilot_checkout_eligibility(target_organization_id) then
    raise exception 'paid_pilot_invitation_required' using errcode = '42501';
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
    organization_id, provider, mode, plan, billing_cycle, currency,
    expected_amount_minor, provider_price_ref, idempotency_key
  ) values (
    target_organization_id, 'stripe', p_mode, p_plan, p_cycle, 'CAD',
    amount, p_price_ref, p_idempotency_key
  ) on conflict (organization_id, provider, idempotency_key) do update
    set updated_at = now()
    where public.billing_provider_intents.mode = excluded.mode
      and public.billing_provider_intents.plan = excluded.plan
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

revoke all on function public.prepare_stripe_checkout(uuid,text,text,text,text,text) from public, anon;
grant execute on function public.prepare_stripe_checkout(uuid,text,text,text,text,text) to authenticated;

commit;
