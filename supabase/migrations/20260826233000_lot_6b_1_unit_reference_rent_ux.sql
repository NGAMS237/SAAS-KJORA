alter table public.units
  add column reference_rent_xaf bigint
  check (reference_rent_xaf is null or reference_rent_xaf > 0);

grant insert (reference_rent_xaf) on table public.units to authenticated;
grant update (reference_rent_xaf) on table public.units to authenticated;

create or replace function public.create_property_with_reference_rent(
  target_organization_id uuid,
  property_name text,
  property_locality text,
  property_type text,
  unit_reference_rent_xaf bigint default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_property_id uuid;
begin
  if property_type not in ('house', 'building')
    or char_length(trim(property_name)) not between 2 and 120
    or char_length(trim(property_locality)) not between 2 and 160
    or (unit_reference_rent_xaf is not null and unit_reference_rent_xaf <= 0)
    or (property_type = 'building' and unit_reference_rent_xaf is not null) then
    raise exception 'invalid_property_input' using errcode = '23514';
  end if;

  insert into public.properties (
    organization_id, name, locality, type, created_by
  ) values (
    target_organization_id, trim(property_name), trim(property_locality), property_type, auth.uid()
  ) returning id into created_property_id;

  if property_type = 'house' and unit_reference_rent_xaf is not null then
    update public.units
    set reference_rent_xaf = unit_reference_rent_xaf
    where organization_id = target_organization_id
      and property_id = created_property_id
      and type = 'whole_house';
  end if;

  return created_property_id;
end;
$$;

revoke all on function public.create_property_with_reference_rent(uuid, text, text, text, bigint)
  from public, anon;
grant execute on function public.create_property_with_reference_rent(uuid, text, text, text, bigint)
  to authenticated;

alter table public.leases
  add column prepaid_full_periods bigint generated always as (
    initial_prepayment_amount_xaf / (base_rent_xaf + recurring_charges_xaf)
  ) stored,
  add column prepayment_remainder_xaf bigint generated always as (
    initial_prepayment_amount_xaf % (base_rent_xaf + recurring_charges_xaf)
  ) stored,
  add column end_reason text
  check (end_reason is null or char_length(trim(end_reason)) between 3 and 500);

-- One existing active Lease must adopt the new global reminder. Temporarily suspend
-- only the terms-immutability trigger inside this migration transaction; all RLS,
-- constraints and the other audit/timestamp triggers remain active.
alter table public.leases disable trigger leases_enforce_invariants;

update public.leases
set due_day = least(due_day, 28),
    generate_due_days_before = case
      when generate_due_days_before in (1, 2, 3, 4, 5, 7, 10) then generate_due_days_before
      else 5
    end,
    overdue_reminder_days_after = 10
where due_day > 28
   or generate_due_days_before not in (1, 2, 3, 4, 5, 7, 10)
   or overdue_reminder_days_after <> 10;

alter table public.leases enable trigger leases_enforce_invariants;

alter table public.leases
  drop constraint leases_due_day_check,
  drop constraint leases_generate_due_days_before_check,
  drop constraint leases_overdue_reminder_days_after_check,
  alter column overdue_reminder_days_after set default 10,
  add constraint leases_due_day_check check (due_day between 1 and 28),
  add constraint leases_generate_due_days_before_check
    check (generate_due_days_before in (1, 2, 3, 4, 5, 7, 10)),
  add constraint leases_overdue_reminder_days_after_check
    check (overdue_reminder_days_after = 10),
  add constraint leases_end_reason_consistent
    check (end_reason is null or status = 'ended');

revoke insert (initial_prepayment_periods) on table public.leases from authenticated;
revoke update (initial_prepayment_periods) on table public.leases from authenticated;
grant update (end_reason) on table public.leases to authenticated;

comment on column public.units.reference_rent_xaf is
  'Lot 6B.1: optional Unit suggestion used to prefill, never rewrite, a Lease contractual rent.';
comment on column public.leases.prepaid_full_periods is
  'Lot 6B.1: informative full-period coverage derived without creating Dues, Payments or Ledger entries.';
comment on column public.leases.prepayment_remainder_xaf is
  'Lot 6B.1: informative prepayment remainder; it is not an accounting credit before Lot 6C2.';
comment on column public.leases.initial_prepayment_periods is
  'Deprecated Lot 6B input retained non-destructively; no longer writable or used as the coverage truth.';
comment on column public.leases.overdue_reminder_days_after is
  'Lot 6B.1: global KJORA overdue reminder interval, fixed to every 10 days; notifications remain deferred to 6C3.';
comment on column public.leases.end_reason is
  'Optional reason captured only by the explicit end-lease confirmation flow.';
comment on function public.create_property_with_reference_rent(uuid, text, text, text, bigint) is
  'Lot 6B.1: RLS-bound atomic Property creation and whole-house Unit reference-rent assignment.';
