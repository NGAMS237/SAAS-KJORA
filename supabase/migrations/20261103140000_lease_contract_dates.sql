-- Dates "du contrat" (information) : modifiables à tout moment sur un bail non terminé,
-- sans toucher à start_date / end_date (qui pilotent les échéances et restent immuables).
alter table public.leases add column if not exists contract_start_date date;
alter table public.leases add column if not exists contract_end_date date;

alter table public.leases drop constraint if exists leases_contract_dates_order;
alter table public.leases add constraint leases_contract_dates_order
  check (contract_end_date is null or contract_start_date is null or contract_end_date >= contract_start_date);

create or replace function public.set_lease_contract_dates(
  target_lease_id uuid,
  target_contract_start date,
  target_contract_end date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_lease public.leases%rowtype;
begin
  select * into selected_lease from public.leases where id = target_lease_id;
  if not found or selected_lease.status = 'ended'
    or not (select private.has_capability(selected_lease.organization_id, 'lease.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_contract_end is not null and target_contract_start is not null and target_contract_end < target_contract_start then
    raise exception 'invalid_contract_dates' using errcode = '23514';
  end if;
  update public.leases
     set contract_start_date = target_contract_start,
         contract_end_date = target_contract_end
   where id = target_lease_id;
end;
$$;

revoke all on function public.set_lease_contract_dates(uuid, date, date) from public, anon;
grant execute on function public.set_lease_contract_dates(uuid, date, date) to authenticated;
