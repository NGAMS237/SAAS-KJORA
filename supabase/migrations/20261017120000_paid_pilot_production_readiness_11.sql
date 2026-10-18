begin;

-- KJORA — PAID-PILOT-PRODUCTION-READINESS-11
-- Migration additive. Elle prépare Test et Live sans activer Live, sans secret,
-- sans appel réseau et sans modifier les données métier existantes.

create table if not exists public.paid_pilot_access (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  status text not null check (status in ('active','revoked')),
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint paid_pilot_access_revocation_pair check (
    (status = 'active' and revoked_by is null and revoked_at is null)
    or (status = 'revoked' and revoked_by is not null and revoked_at is not null)
  )
);

alter table public.paid_pilot_access enable row level security;
revoke all on public.paid_pilot_access from public, anon, authenticated;
grant select, insert, update on public.paid_pilot_access to service_role;

create or replace function public.admin_set_paid_pilot_access(
  target_organization_id uuid,
  target_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  if not exists (select 1 from public.organizations where id = target_organization_id) then
    raise exception 'organization_not_found' using errcode = '22023';
  end if;
  insert into public.paid_pilot_access (
    organization_id, status, approved_by, approved_at, revoked_by, revoked_at, updated_at
  ) values (
    target_organization_id,
    case when target_active then 'active' else 'revoked' end,
    (select auth.uid()), now(),
    case when target_active then null else (select auth.uid()) end,
    case when target_active then null else now() end,
    now()
  ) on conflict (organization_id) do update set
    status = excluded.status,
    approved_by = case when target_active then excluded.approved_by else public.paid_pilot_access.approved_by end,
    approved_at = case when target_active then now() else public.paid_pilot_access.approved_at end,
    revoked_by = excluded.revoked_by,
    revoked_at = excluded.revoked_at,
    updated_at = now();
  return true;
end;
$$;

revoke all on function public.admin_set_paid_pilot_access(uuid,boolean) from public, anon;
grant execute on function public.admin_set_paid_pilot_access(uuid,boolean) to authenticated;

create or replace function public.paid_pilot_checkout_eligibility(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.memberships m
      where m.organization_id = target_organization_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
        and m.role = 'organization_owner'
    )
    and private.has_capability(target_organization_id, 'billing.manage')
    and exists (
      select 1 from public.paid_pilot_access a
      where a.organization_id = target_organization_id and a.status = 'active'
    )
    and exists (
      select 1 from public.organizations o
      where o.id = target_organization_id and o.status = 'active'
    );
$$;

revoke all on function public.paid_pilot_checkout_eligibility(uuid) from public, anon;
grant execute on function public.paid_pilot_checkout_eligibility(uuid) to authenticated;

alter table public.billing_provider_intents
  drop constraint if exists billing_provider_intents_mode_check;
alter table public.billing_provider_intents
  add constraint billing_provider_intents_mode_check check (mode in ('sandbox','live'));

alter table public.organization_subscriptions
  add column if not exists last_payment_state text,
  add column if not exists last_payment_at timestamptz,
  add column if not exists last_provider_sync_at timestamptz;

alter table public.organization_subscriptions
  drop constraint if exists organization_subscriptions_last_payment_state_check;
alter table public.organization_subscriptions
  add constraint organization_subscriptions_last_payment_state_check
  check (last_payment_state is null or last_payment_state in ('paid','failed','action_required'));

alter table public.billing_invoices
  drop constraint if exists billing_invoices_generation_source_check;
alter table public.billing_invoices
  add constraint billing_invoices_generation_source_check
  check (generation_source in ('manual','automatic','provider'));

create unique index if not exists billing_invoices_provider_ref_unique
  on public.billing_invoices(provider_invoice_ref)
  where provider_invoice_ref is not null;

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
  if p_mode = 'live' and not public.paid_pilot_checkout_eligibility(target_organization_id) then
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

create or replace function public.attach_stripe_checkout(
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
  update public.billing_provider_intents i set
    checkout_session_ref = p_checkout_session_ref,
    status = 'checkout_open', updated_at = now()
  where i.id = target_intent_id
    and private.has_capability(i.organization_id, 'billing.manage')
    and i.checkout_session_ref is null
    and ((i.mode = 'sandbox' and p_checkout_session_ref ~ '^cs_test_[A-Za-z0-9_]+$')
      or (i.mode = 'live' and p_checkout_session_ref ~ '^cs_live_[A-Za-z0-9_]+$'))
  returning i.id into changed;
  return changed is not null;
end;
$$;

revoke all on function public.prepare_stripe_checkout(uuid,text,text,text,text,text) from public, anon;
revoke all on function public.attach_stripe_checkout(uuid,text) from public, anon;
grant execute on function public.prepare_stripe_checkout(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.attach_stripe_checkout(uuid,text) to authenticated;

create or replace function public.process_stripe_event_v2(
  p_mode text,
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
  p_current_period_end timestamptz default null,
  p_invoice_ref text default null,
  p_invoice_amount_minor bigint default null,
  p_invoice_currency text default null,
  p_invoice_period_start timestamptz default null,
  p_invoice_period_end timestamptz default null,
  p_invoice_paid_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  intent public.billing_provider_intents%rowtype;
  next_status text;
  payment_state text;
  event_id uuid;
  invoice_status text;
  local_invoice_number text;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_mode not in ('sandbox','live')
     or p_provider_event_id is null or p_provider_event_id !~ '^evt_[A-Za-z0-9_]+$'
     or p_event_type is null or char_length(p_event_type) not between 3 and 120
     or p_event_created_at is null
     or p_payload_digest is null or p_payload_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_stripe_event' using errcode = '22023';
  end if;

  insert into public.billing_webhook_events (
    provider, provider_event_id, event_type, mode, payload_digest,
    signature_verified, disposition
  ) values (
    'stripe', p_provider_event_id, p_event_type, p_mode, p_payload_digest,
    true, 'acknowledge_unhandled'
  ) on conflict (provider, provider_event_id) do nothing
  returning id into event_id;
  if event_id is null then return jsonb_build_object('outcome','ignored_duplicate'); end if;

  if p_intent_key is not null then
    select * into intent from public.billing_provider_intents
     where provider = 'stripe' and mode = p_mode and idempotency_key = p_intent_key for update;
  elsif p_subscription_ref is not null then
    select i.* into intent
      from public.organization_subscriptions s
      join public.billing_provider_intents i on i.organization_id = s.organization_id
     where s.provider = 'stripe' and s.provider_subscription_ref = p_subscription_ref
       and i.provider = 'stripe' and i.mode = p_mode
     order by i.created_at desc limit 1 for update of i;
  elsif p_invoice_ref is not null then
    select i.* into intent
      from public.billing_invoices bi
      join public.billing_provider_intents i on i.organization_id = bi.organization_id
     where bi.provider_invoice_ref = p_invoice_ref
       and i.provider = 'stripe' and i.mode = p_mode
     order by i.created_at desc limit 1 for update of i;
  end if;

  if intent.id is null then
    update public.billing_webhook_events set
      disposition = 'acknowledge_unhandled', disposition_reason = 'intent_unmatched', processed_at = now()
    where id = event_id;
    return jsonb_build_object('outcome','unmatched');
  end if;

  if p_event_type in ('invoice.paid','invoice.payment_failed','invoice.payment_action_required') then
    if p_invoice_ref is null or p_invoice_ref !~ '^in_[A-Za-z0-9_]+$'
       or p_invoice_currency <> intent.currency
       or p_invoice_amount_minor is null or p_invoice_amount_minor <> intent.expected_amount_minor
       or p_invoice_period_start is null or p_invoice_period_end is null
       or p_invoice_period_end <= p_invoice_period_start then
      raise exception 'stripe_invoice_contract_mismatch' using errcode = '22023';
    end if;
    invoice_status := case when p_event_type = 'invoice.paid' then 'paid' else 'open' end;
    if invoice_status = 'paid' and p_invoice_paid_at is null then
      raise exception 'stripe_paid_invoice_timestamp_missing' using errcode = '22023';
    end if;
    local_invoice_number := 'STRIPE-' || case when p_mode = 'live' then 'LIVE-' else 'TEST-' end
      || upper(right(p_invoice_ref, 18));
    insert into public.billing_invoices (
      organization_id, number, plan, billing_cycle, currency, amount_minor,
      period_start, period_end, due_on, status, issued_on, paid_at,
      provider_invoice_ref, generation_source, issue_idempotency_key
    ) values (
      intent.organization_id, local_invoice_number, intent.plan, intent.billing_cycle,
      intent.currency, p_invoice_amount_minor, p_invoice_period_start::date,
      p_invoice_period_end::date, p_invoice_period_end::date, invoice_status,
      p_event_created_at::date, p_invoice_paid_at, p_invoice_ref, 'provider',
      'stripe:' || p_mode || ':' || p_invoice_ref
    ) on conflict (provider_invoice_ref) where provider_invoice_ref is not null do update set
      status = excluded.status,
      paid_at = coalesce(excluded.paid_at, public.billing_invoices.paid_at),
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      due_on = excluded.due_on;
  end if;

  if intent.last_provider_event_created_at is not null
     and p_event_created_at < intent.last_provider_event_created_at then
    update public.billing_webhook_events set organization_id = intent.organization_id,
      disposition = 'acknowledge_unhandled', disposition_reason = 'event_out_of_order', processed_at = now()
    where id = event_id;
    return jsonb_build_object('outcome','ignored_out_of_order','invoiceSynchronized',p_invoice_ref is not null);
  end if;

  next_status := case
    when p_event_type in ('checkout.session.completed','invoice.paid') and p_payment_status = 'paid' then 'paid'
    when p_event_type = 'invoice.paid' then 'paid'
    when p_event_type in ('invoice.payment_failed','invoice.payment_action_required') then 'payment_failed'
    when p_event_type in ('customer.subscription.created','customer.subscription.updated') and p_cancel_at_period_end then 'cancellation_scheduled'
    when p_event_type in ('customer.subscription.created','customer.subscription.updated') and p_provider_status = 'canceled' then 'cancelled'
    when p_event_type in ('customer.subscription.created','customer.subscription.updated') and p_provider_status in ('past_due','unpaid','incomplete_expired') then 'payment_failed'
    when p_event_type in ('customer.subscription.created','customer.subscription.updated') and p_provider_status in ('active','trialing') then 'paid'
    when p_event_type = 'customer.subscription.deleted' then 'cancelled'
    when p_event_type = 'charge.refunded' then 'cancelled'
    else null end;
  payment_state := case
    when p_event_type = 'invoice.paid' then 'paid'
    when p_event_type = 'invoice.payment_failed' then 'failed'
    when p_event_type = 'invoice.payment_action_required' then 'action_required'
    else null end;

  if next_status is null then
    update public.billing_webhook_events set organization_id = intent.organization_id,
      disposition = 'acknowledge_unhandled', disposition_reason = 'event_type_unhandled', processed_at = now()
    where id = event_id;
    return jsonb_build_object('outcome','acknowledged_unhandled');
  end if;

  update public.billing_provider_intents set status = next_status,
    last_provider_event_id = p_provider_event_id,
    last_provider_event_created_at = p_event_created_at, updated_at = now()
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
      renewal_date = coalesce(p_current_period_end::date, renewal_date),
      last_payment_state = coalesce(payment_state, last_payment_state),
      last_payment_at = case when payment_state = 'paid' then coalesce(p_invoice_paid_at,p_event_created_at) else last_payment_at end,
      last_provider_sync_at = now()
    where organization_id = intent.organization_id;
    perform private.assign_organization_plan(intent.organization_id, intent.plan);
  elsif next_status = 'payment_failed' then
    update public.organization_subscriptions set status = 'payment_failed', last_failure_on = current_date,
      last_payment_state = coalesce(payment_state,'failed'), last_provider_sync_at = now()
    where organization_id = intent.organization_id and status <> 'cancelled';
  elsif next_status = 'cancellation_scheduled' then
    if p_current_period_end is null then
      raise exception 'missing_cancellation_effective_date' using errcode = '22023';
    end if;
    update public.organization_subscriptions set status = 'cancellation_scheduled',
      cancellation_requested_at = now(), cancellation_effective_on = p_current_period_end::date,
      current_period_end = p_current_period_end::date, renewal_date = null,
      last_provider_sync_at = now()
    where organization_id = intent.organization_id;
  elsif next_status = 'cancelled' then
    update public.organization_subscriptions set status = 'cancelled', cancelled_at = now(),
      renewal_date = null, last_provider_sync_at = now()
    where organization_id = intent.organization_id;
    perform private.assign_organization_plan(intent.organization_id, 'decouverte');
  end if;

  insert into public.billing_events (organization_id, event_type, from_status, to_status, payload, provider_event_id)
  values (intent.organization_id,
    'stripe_' || p_mode || '_' || replace(p_event_type,'.','_'), null, next_status,
    jsonb_build_object('intentId', intent.id), p_provider_event_id);

  update public.billing_webhook_events set organization_id = intent.organization_id,
    disposition = 'apply', disposition_reason = null, processed_at = now()
  where id = event_id;
  return jsonb_build_object('outcome','applied','status',next_status,'invoiceSynchronized',p_invoice_ref is not null);
end;
$$;

revoke all on function public.process_stripe_event_v2(text,text,text,timestamptz,text,text,text,text,text,text,boolean,timestamptz,text,bigint,text,timestamptz,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.process_stripe_event_v2(text,text,text,timestamptz,text,text,text,text,text,text,boolean,timestamptz,text,bigint,text,timestamptz,timestamptz,timestamptz) to service_role;

create or replace function public.get_billing_overview(target_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sub public.organization_subscriptions;
  eff text;
  usg record;
  lim record;
  op public.organization_plans;
begin
  if not private.can_read_billing(target_organization_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into sub from public.organization_subscriptions where organization_id = target_organization_id;
  op := private.get_org_plan(target_organization_id);
  eff := op.plan;
  select * into usg from private.billing_usage(target_organization_id);
  select * into lim from private.plan_quota_limits(op.plan, op.custom_max_properties, op.custom_max_active_units, op.custom_max_collaborators, op.custom_max_organizations);
  return jsonb_build_object(
    'organizationId', target_organization_id, 'effectivePlan', eff,
    'subscription', case when sub.organization_id is null then
      jsonb_build_object('exists',false,'status','free','plan','decouverte','billingCycle','monthly','currency','XAF')
    else jsonb_build_object(
      'exists',true,'status',sub.status,'plan',sub.plan,'billingCycle',sub.billing_cycle,'currency',sub.currency,
      'currentPeriodStart',sub.current_period_start,'currentPeriodEnd',sub.current_period_end,'renewalDate',sub.renewal_date,
      'graceEndsOn',sub.grace_ends_on,'blockedAt',sub.blocked_at,'cancellationEffectiveOn',sub.cancellation_effective_on,
      'scheduledPlan',sub.scheduled_plan,'scheduledCycle',sub.scheduled_cycle,'scheduledEffectiveOn',sub.scheduled_effective_on,
      'pendingPlan',sub.pending_plan,'pendingCycle',sub.pending_cycle,'pendingAmountMinor',sub.pending_amount_minor,
      'provider',sub.provider,'paymentMethodBrand',sub.payment_method_brand,'paymentMethodLast4',sub.payment_method_last4,
      'paymentMethodExpiresOn',sub.payment_method_expires_on,'lastPaymentState',sub.last_payment_state,
      'lastPaymentAt',sub.last_payment_at,'lastProviderSyncAt',sub.last_provider_sync_at)
    end,
    'usage',jsonb_build_object('activeProperties',usg.active_properties,'activeUnits',usg.active_units,'collaborators',usg.collaborators,'organizations',usg.organizations),
    'quotas',jsonb_build_object('maxProperties',lim.max_properties,'maxActiveUnits',lim.max_active_units,'maxCollaborators',lim.max_collaborators,'maxOrganizations',lim.max_organizations)
  );
end;
$$;
revoke all on function public.get_billing_overview(uuid) from public, anon;
grant execute on function public.get_billing_overview(uuid) to authenticated;

drop function if exists public.list_billing_invoices(uuid);
create function public.list_billing_invoices(target_organization_id uuid)
returns table (
  id uuid, number text, plan text, billing_cycle text, currency text,
  amount_minor bigint, period_start date, period_end date, due_on date,
  status text, issued_on date, paid_at timestamptz, manual_reference text,
  manual_payment_confirmed_at timestamptz, generation_source text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read_billing(target_organization_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select i.id,i.number,i.plan,i.billing_cycle,i.currency,i.amount_minor,
    i.period_start,i.period_end,i.due_on,i.status,i.issued_on,i.paid_at,
    i.manual_reference,i.manual_payment_confirmed_at,i.generation_source
  from public.billing_invoices i where i.organization_id = target_organization_id
  order by i.issued_on desc,i.created_at desc limit 200;
end;
$$;
revoke all on function public.list_billing_invoices(uuid) from public, anon;
grant execute on function public.list_billing_invoices(uuid) to authenticated;

-- Vue opérationnelle plateforme : état fonctionnel seulement. Les identifiants
-- client/abonnement/facture du fournisseur et les moyens de paiement restent
-- volontairement hors du résultat.
create or replace function public.admin_list_subscriptions(
  page_limit integer default 25,
  page_offset integer default 0,
  search_term text default null,
  plan_filter text default null,
  status_filter text default null,
  currency_filter text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_limit integer := least(greatest(coalesce(page_limit,25),1),100);
  safe_offset integer := greatest(coalesce(page_offset,0),0);
  safe_search text := nullif(trim(coalesce(search_term,'')),'');
  safe_plan text := nullif(trim(coalesce(plan_filter,'')),'');
  safe_status text := nullif(trim(coalesce(status_filter,'')),'');
  safe_currency text := nullif(trim(coalesce(currency_filter,'')),'');
  total bigint;
  page_rows jsonb;
begin
  perform private.assert_platform_admin();
  select count(*) into total
    from public.organization_subscriptions s
    left join public.organization_profiles p on p.organization_id=s.organization_id
   where (safe_search is null or p.name ilike '%'||safe_search||'%')
     and (safe_plan is null or s.plan::text=safe_plan)
     and (safe_status is null or s.status::text=safe_status)
     and (safe_currency is null or s.currency::text=safe_currency);
  select coalesce(jsonb_agg(row_to_json(page)),'[]'::jsonb) into page_rows from (
    select s.organization_id,coalesce(p.name,'')::text organization_name,
      s.status::text status,s.plan::text plan,s.billing_cycle::text billing_cycle,
      s.currency::text currency,s.current_period_end,s.renewal_date,s.grace_ends_on,
      (s.provider is not null) has_provider,s.last_payment_state,s.last_payment_at,
      s.last_provider_sync_at,
      (select w.event_type from public.billing_webhook_events w
        where w.organization_id=s.organization_id order by w.received_at desc limit 1) last_webhook_event,
      (select w.disposition from public.billing_webhook_events w
        where w.organization_id=s.organization_id order by w.received_at desc limit 1) last_webhook_disposition,
      s.updated_at
    from public.organization_subscriptions s
    left join public.organization_profiles p on p.organization_id=s.organization_id
    where (safe_search is null or p.name ilike '%'||safe_search||'%')
      and (safe_plan is null or s.plan::text=safe_plan)
      and (safe_status is null or s.status::text=safe_status)
      and (safe_currency is null or s.currency::text=safe_currency)
    order by s.updated_at desc,s.organization_id limit safe_limit offset safe_offset
  ) page;
  return jsonb_build_object('rows',page_rows,'total_count',total,'limit',safe_limit,'offset',safe_offset);
end;
$$;
revoke all on function public.admin_list_subscriptions(integer,integer,text,text,text,text) from public, anon;
grant execute on function public.admin_list_subscriptions(integer,integer,text,text,text,text) to authenticated;

commit;
