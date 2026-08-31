-- Post-6D controlled patch. Local proposal only until Blaise authorizes Production.
alter table public.organization_profiles drop constraint if exists organization_profiles_currency_code_check;
alter table public.organization_profiles add constraint organization_profiles_currency_code_check
  check (currency_code = 'XAF');

create or replace function private.validate_organization_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid_organization_timezone' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists organization_profiles_validate_timezone on public.organization_profiles;
create trigger organization_profiles_validate_timezone
before insert or update of timezone on public.organization_profiles
for each row execute function private.validate_organization_timezone();

create or replace function public.update_organization_profile_settings(
  target_organization_id uuid,
  organization_name text,
  organization_language text,
  organization_timezone text,
  organization_currency text
)
returns table (organization_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_currency text;
  has_financial_data boolean;
begin
  if (select auth.uid()) is null
    or not (select private.has_capability(target_organization_id, 'organization.profile.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(trim(organization_name)) not between 2 and 120
    or organization_language not in ('fr', 'en')
    or not exists (select 1 from pg_catalog.pg_timezone_names where name = organization_timezone) then
    raise exception 'invalid_organization_settings' using errcode = '22023';
  end if;

  select p.currency_code into current_currency
  from public.organization_profiles p where p.organization_id = target_organization_id for update;
  if current_currency is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select exists (select 1 from public.leases l where l.organization_id = target_organization_id)
    or exists (select 1 from public.dues d where d.organization_id = target_organization_id)
    or exists (select 1 from public.payments p where p.organization_id = target_organization_id)
    or exists (select 1 from public.ledger_entries e where e.organization_id = target_organization_id)
  into has_financial_data;
  if has_financial_data and current_currency <> organization_currency then
    raise exception 'organization_currency_locked' using errcode = '23514';
  end if;
  if organization_currency <> 'XAF' then
    raise exception 'organization_currency_not_enabled' using errcode = '22023';
  end if;

  update public.organization_profiles p set
    name = trim(organization_name), language = organization_language,
    timezone = organization_timezone, currency_code = organization_currency
  where p.organization_id = target_organization_id;
  return query select target_organization_id;
end;
$$;

revoke all on function public.update_organization_profile_settings(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_organization_profile_settings(uuid, text, text, text, text) to authenticated;

comment on function public.update_organization_profile_settings(uuid, text, text, text, text) is
  'Post-6D: capability-scoped Organization settings update; XAF-only MVP and currency lock after financial data exists.';
