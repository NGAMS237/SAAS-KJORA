-- KJORA — synchronize the paid provider invoice period and its one local
-- payment attempt. The trigger is deliberately limited to provider invoices;
-- rent payments and manual SaaS invoices remain untouched.

begin;

create or replace function private.sync_provider_paid_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provider_mode text;
begin
  if new.generation_source <> 'provider'
     or new.status <> 'paid'
     or new.provider_invoice_ref is null then
    return new;
  end if;

  provider_mode := case
    when new.number like 'STRIPE-LIVE-%' then 'live'
    when new.number like 'STRIPE-TEST-%' then 'sandbox'
    else null
  end;
  if provider_mode is null then
    raise exception 'provider_invoice_mode_missing' using errcode = '22023';
  end if;

  insert into public.billing_payment_attempts (
    organization_id, invoice_id, attempt_number, scheduled_on, status,
    failure_code, provider_attempt_ref, idempotency_key, completed_at
  ) values (
    new.organization_id, new.id, 0, new.paid_at::date, 'succeeded',
    null, null, 'stripe:' || provider_mode || ':invoice:' || new.provider_invoice_ref,
    new.paid_at
  ) on conflict (organization_id, idempotency_key) do update set
    invoice_id = excluded.invoice_id,
    status = 'succeeded',
    failure_code = null,
    completed_at = coalesce(public.billing_payment_attempts.completed_at, excluded.completed_at);

  update public.organization_subscriptions set
    current_period_start = new.period_start,
    current_period_end = new.period_end,
    renewal_date = case when status = 'cancellation_scheduled' then null else new.period_end end,
    last_payment_state = 'paid',
    last_payment_at = coalesce(last_payment_at, new.paid_at),
    last_provider_sync_at = now()
  where organization_id = new.organization_id
    and provider = 'stripe';

  return new;
end;
$$;

revoke all on function private.sync_provider_paid_invoice() from public, anon, authenticated;

drop trigger if exists billing_provider_paid_invoice_sync on public.billing_invoices;
create trigger billing_provider_paid_invoice_sync
after insert or update of status, paid_at, period_start, period_end
on public.billing_invoices
for each row
when (
  new.generation_source = 'provider'
  and new.status = 'paid'
  and new.provider_invoice_ref is not null
)
execute function private.sync_provider_paid_invoice();

commit;
