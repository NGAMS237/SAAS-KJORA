-- LOT 6C1 — allow append-only cancellation only from a nested lease lifecycle trigger.
-- Direct due updates remain forbidden, including for authenticated clients.

create or replace function private.protect_due_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and pg_trigger_depth() > 1
    and to_jsonb(new) - 'cancelled_at' = to_jsonb(old) - 'cancelled_at'
    and old.cancelled_at is null
    and new.cancelled_at is not null then
    return new;
  end if;
  raise exception 'financial_history_is_append_only' using errcode = '23514';
end;
$$;

revoke all on function private.protect_due_history() from public, anon, authenticated;
