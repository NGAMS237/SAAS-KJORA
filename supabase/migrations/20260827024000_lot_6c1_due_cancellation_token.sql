-- LOT 6C1 — authorize due cancellation through the private lifecycle function only.
-- Authenticated roles retain SELECT-only grants on dues, and every other mutation
-- continues to be rejected by the append-only trigger.

create or replace function private.protect_due_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and current_setting('kjora.financial_maintenance', true) = 'cancel_future_due'
    and old.cancelled_at is null
    and new.cancelled_at is not null then
    return new;
  end if;
  raise exception 'financial_history_is_append_only' using errcode = '23514';
end;
$$;

create or replace function private.cancel_lease_future_dues(target_lease_id uuid, effective_end date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_due public.dues%rowtype;
  cancelled_count integer := 0;
begin
  for selected_due in
    select * from public.dues
    where lease_id = target_lease_id
      and kind in ('periodic', 'initial_prorata')
      and period_start > effective_end
      and cancelled_at is null
    order by period_start, id
  loop
    insert into public.dues (
      organization_id, lease_id, tenant_id, kind, generation_key, reference,
      period_start, period_end, due_date, notice_date, adjustment_amount_xaf,
      adjustment_direction, adjusted_due_id, calculation, created_by
    ) values (
      selected_due.organization_id, selected_due.lease_id, selected_due.tenant_id,
      'adjustment', 'end-cancellation:' || selected_due.id::text,
      'CAN-' || left(selected_due.id::text, 8),
      selected_due.period_start, selected_due.period_end, selected_due.due_date, effective_end,
      selected_due.expected_amount_xaf, 'credit', selected_due.id,
      jsonb_build_object(
        'reason', 'lease_ended_before_period',
        'effective_end', effective_end,
        'cancelled_due_id', selected_due.id,
        'original_expected_xaf', selected_due.expected_amount_xaf
      ), selected_due.created_by
    ) on conflict (organization_id, lease_id, generation_key) do nothing;

    perform set_config('kjora.financial_maintenance', 'cancel_future_due', true);
    update public.dues set cancelled_at = now() where id = selected_due.id;
    cancelled_count := cancelled_count + 1;
  end loop;
  return cancelled_count;
end;
$$;

revoke all on function private.protect_due_history() from public, anon, authenticated;
revoke all on function private.cancel_lease_future_dues(uuid, date) from public, anon, authenticated;
