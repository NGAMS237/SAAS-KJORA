create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id),
  status text not null default 'active' check (status in ('active', 'suspended'))
);

create table public.organization_profiles (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  country_code text not null default 'CM' check (country_code = 'CM'),
  currency_code text not null default 'XAF' check (currency_code = 'XAF'),
  language text not null default 'fr' check (language in ('fr', 'en')),
  timezone text not null default 'Africa/Douala' check (char_length(timezone) between 3 and 80),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in (
    'organization_owner', 'manager', 'collector', 'caretaker', 'accountant', 'viewer'
  )),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index memberships_user_active_idx on public.memberships (user_id, organization_id)
  where status = 'active';
create index memberships_organization_active_idx on public.memberships (organization_id, user_id)
  where status = 'active';

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger organization_profiles_touch_updated_at
before update on public.organization_profiles
for each row execute function private.touch_updated_at();

alter table public.organizations enable row level security;
alter table public.organization_profiles enable row level security;
alter table public.memberships enable row level security;

create or replace function private.is_active_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where organization_id = target_organization_id
      and user_id = (select auth.uid())
      and status = 'active'
  );
$$;

create or replace function private.is_organization_owner(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where organization_id = target_organization_id
      and user_id = (select auth.uid())
      and status = 'active'
      and role = 'organization_owner'
  );
$$;

revoke all on function private.is_active_member(uuid) from public, anon;
revoke all on function private.is_organization_owner(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_active_member(uuid) to authenticated;
grant execute on function private.is_organization_owner(uuid) to authenticated;

create policy "members can read their organizations"
on public.organizations for select to authenticated
using ((select private.is_active_member(id)));

create policy "members can read organization profiles"
on public.organization_profiles for select to authenticated
using ((select private.is_active_member(organization_id)));

create policy "owners can update organization profiles"
on public.organization_profiles for update to authenticated
using ((select private.is_organization_owner(organization_id)))
with check ((select private.is_organization_owner(organization_id)));

create policy "users can read their own memberships"
on public.memberships for select to authenticated
using (user_id = (select auth.uid()) and status = 'active');

revoke all on public.organizations, public.organization_profiles, public.memberships from anon, authenticated;
grant select (id, status) on public.organizations to authenticated;
grant select (organization_id, name, country_code, currency_code, language, timezone, updated_at)
  on public.organization_profiles to authenticated;
grant select (id, organization_id, user_id, role, status, created_at) on public.memberships to authenticated;
grant update (name, language, timezone) on public.organization_profiles to authenticated;

create or replace function public.create_organization(
  organization_name text,
  organization_language text default 'fr',
  organization_timezone text default 'Africa/Douala'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or not exists (
    select 1 from auth.users where id = current_user_id and email_confirmed_at is not null
  ) then
    raise exception 'verified_identity_required' using errcode = '42501';
  end if;
  if char_length(trim(organization_name)) not between 2 and 120 then
    raise exception 'invalid_organization_name' using errcode = '22023';
  end if;
  if organization_language not in ('fr', 'en') then
    raise exception 'invalid_organization_language' using errcode = '22023';
  end if;
  if char_length(trim(organization_timezone)) not between 3 and 80 then
    raise exception 'invalid_organization_timezone' using errcode = '22023';
  end if;

  insert into public.organizations (created_by)
  values (current_user_id)
  returning id into new_organization_id;

  insert into public.organization_profiles (
    organization_id, name, country_code, currency_code, language, timezone
  ) values (
    new_organization_id, trim(organization_name), 'CM', 'XAF',
    organization_language, trim(organization_timezone)
  );

  insert into public.memberships (organization_id, user_id, role)
  values (new_organization_id, current_user_id, 'organization_owner');

  return new_organization_id;
end;
$$;

revoke all on function public.create_organization(text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text) to authenticated;

comment on function public.create_organization(text, text, text) is
  'Lot 5B: creates one Organization, its minimal profile and owner Membership atomically.';
