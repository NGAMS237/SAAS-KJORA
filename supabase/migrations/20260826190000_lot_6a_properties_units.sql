alter table public.role_capabilities
  drop constraint role_capabilities_capability_check;

alter table public.role_capabilities
  add constraint role_capabilities_capability_check check (capability in (
    'organization.view', 'organization.profile.manage',
    'member.view', 'member.manage',
    'property.view', 'property.manage',
    'unit.view', 'unit.manage',
    'tenant.view', 'tenant.manage',
    'lease.view', 'lease.manage',
    'due.view', 'payment.view', 'payment.record', 'payment.correction.request',
    'receipt.view', 'receipt.share', 'activity.view', 'audit.view',
    'tenant_portal.manage'
  ));

insert into public.role_capabilities (role, capability) values
  ('organization_owner', 'unit.view'),
  ('organization_owner', 'unit.manage'),
  ('manager', 'unit.view'),
  ('manager', 'unit.manage'),
  ('collector', 'unit.view'),
  ('caretaker', 'unit.view'),
  ('accountant', 'unit.view'),
  ('viewer', 'unit.view');

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 120),
  locality text not null check (char_length(trim(locality)) between 2 and 160),
  type text not null check (type in ('house', 'building')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint properties_organization_id_id_key unique (organization_id, id),
  constraint properties_archival_consistency check (
    (status = 'active' and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  )
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  property_id uuid not null,
  label text not null check (char_length(trim(label)) between 1 and 120),
  type text not null check (type in (
    'whole_house', 'apartment', 'studio', 'room', 'shop', 'office'
  )),
  area_sqm numeric(10, 2) check (area_sqm is null or area_sqm > 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint units_property_tenant_fk
    foreign key (organization_id, property_id)
    references public.properties (organization_id, id)
    on delete restrict,
  constraint units_archival_consistency check (
    (status = 'active' and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  )
);

create unique index properties_active_name_unique_idx
  on public.properties (organization_id, lower(name))
  where status = 'active';
create index properties_organization_active_idx
  on public.properties (organization_id, status, created_at desc);
create unique index units_active_label_unique_idx
  on public.units (property_id, lower(label))
  where status = 'active';
create unique index units_one_whole_house_idx
  on public.units (property_id)
  where type = 'whole_house' and status = 'active';
create index units_property_active_idx
  on public.units (organization_id, property_id, status, created_at);
create index units_created_by_idx on public.units (created_by);
create index properties_created_by_idx on public.properties (created_by);

create table private.domain_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  event_type text not null check (event_type = 'PROPERTY_CREATED'),
  aggregate_type text not null check (aggregate_type = 'property'),
  aggregate_id uuid not null,
  actor_user_id uuid not null references auth.users (id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (event_type, aggregate_id)
);

create index domain_events_organization_created_idx
  on private.domain_events (organization_id, created_at desc);
create index if not exists domain_events_actor_user_idx
  on private.domain_events (actor_user_id);

alter table public.properties enable row level security;
alter table public.units enable row level security;
alter table private.domain_events enable row level security;

create policy "domain events are internal only"
on private.domain_events for select to authenticated
using (false);

create or replace function private.set_resource_archived_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'archived' and old.status <> 'archived' then
    new.archived_at := now();
  elsif new.status = 'active' then
    new.archived_at := null;
  end if;
  return new;
end;
$$;

create or replace function private.protect_property_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception 'property_organization_immutable' using errcode = '23514';
  end if;
  if new.created_by <> old.created_by then
    raise exception 'property_creator_immutable' using errcode = '23514';
  end if;
  if old.status = 'archived' then
    raise exception 'property_archived_immutable' using errcode = '23514';
  end if;
  if new.type <> old.type then
    raise exception 'property_type_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.enforce_unit_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_type text;
  parent_status text;
begin
  select p.type, p.status into parent_type, parent_status
  from public.properties p
  where p.organization_id = new.organization_id and p.id = new.property_id;

  if parent_type is null or (
    parent_status <> 'active'
    and not (tg_op = 'UPDATE' and old.status = 'active' and new.status = 'archived')
  ) then
    raise exception 'property_unavailable' using errcode = '23503';
  end if;
  if parent_type = 'house' and new.type <> 'whole_house' then
    raise exception 'house_requires_whole_house' using errcode = '23514';
  end if;
  if parent_type = 'building' and new.type = 'whole_house' then
    raise exception 'whole_house_requires_house' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.property_id <> old.property_id then
      raise exception 'unit_parent_immutable' using errcode = '23514';
    end if;
    if new.created_by <> old.created_by then
      raise exception 'unit_creator_immutable' using errcode = '23514';
    end if;
    if old.status = 'archived' then
      raise exception 'unit_archived_immutable' using errcode = '23514';
    end if;
    if (old.type = 'whole_house' or new.type = 'whole_house') and new.type <> old.type then
      raise exception 'whole_house_type_immutable' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.initialize_property()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'house' then
    insert into public.units (
      organization_id, property_id, label, type, created_by
    ) values (
      new.organization_id, new.id, 'Maison entière', 'whole_house', new.created_by
    );
  end if;

  insert into private.domain_events (
    organization_id, event_type, aggregate_type, aggregate_id, actor_user_id, payload
  ) values (
    new.organization_id,
    'PROPERTY_CREATED',
    'property',
    new.id,
    new.created_by,
    jsonb_build_object('property_id', new.id, 'property_type', new.type)
  ) on conflict (event_type, aggregate_id) do nothing;
  return new;
end;
$$;

create or replace function private.archive_property_units()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'archived' and old.status <> 'archived' then
    update public.units
    set status = 'archived', archived_at = now()
    where organization_id = new.organization_id
      and property_id = new.id
      and status = 'active';
  end if;
  return new;
end;
$$;

create trigger properties_protect_type
before update on public.properties
for each row execute function private.protect_property_type();
create trigger properties_set_archived_at
before update on public.properties
for each row execute function private.set_resource_archived_at();
create trigger properties_touch_updated_at
before update on public.properties
for each row execute function private.touch_updated_at();
create trigger properties_initialize
after insert on public.properties
for each row execute function private.initialize_property();
create trigger properties_archive_units
after update of status on public.properties
for each row execute function private.archive_property_units();

create trigger units_enforce_hierarchy
before insert or update on public.units
for each row execute function private.enforce_unit_hierarchy();
create trigger units_set_archived_at
before update on public.units
for each row execute function private.set_resource_archived_at();
create trigger units_touch_updated_at
before update on public.units
for each row execute function private.touch_updated_at();

revoke all on function private.set_resource_archived_at() from public, anon, authenticated;
revoke all on function private.protect_property_type() from public, anon, authenticated;
revoke all on function private.enforce_unit_hierarchy() from public, anon, authenticated;
revoke all on function private.initialize_property() from public, anon, authenticated;
revoke all on function private.archive_property_units() from public, anon, authenticated;

create policy "authorized members read properties"
on public.properties for select to authenticated
using ((select private.has_capability(organization_id, 'property.view')));

create policy "authorized members create properties"
on public.properties for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'active'
  and (select private.has_capability(organization_id, 'property.manage'))
);

create policy "authorized members update properties"
on public.properties for update to authenticated
using ((select private.has_capability(organization_id, 'property.manage')))
with check ((select private.has_capability(organization_id, 'property.manage')));

create policy "authorized members read units"
on public.units for select to authenticated
using ((select private.has_capability(organization_id, 'unit.view')));

create policy "authorized members create units"
on public.units for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'active'
  and (select private.has_capability(organization_id, 'unit.manage'))
);

create policy "authorized members update units"
on public.units for update to authenticated
using ((select private.has_capability(organization_id, 'unit.manage')))
with check ((select private.has_capability(organization_id, 'unit.manage')));

revoke all on table public.properties, public.units from public, anon, authenticated;
grant select on table public.properties, public.units to authenticated;
grant insert (id, organization_id, name, locality, type, created_by)
  on table public.properties to authenticated;
grant update (name, locality, status)
  on table public.properties to authenticated;
grant insert (id, organization_id, property_id, label, type, area_sqm, created_by)
  on table public.units to authenticated;
grant update (label, type, area_sqm, status)
  on table public.units to authenticated;

comment on table public.properties is
  'Lot 6A: tenant-scoped rental properties. Physical deletion is intentionally unavailable; archive instead.';
comment on table public.units is
  'Lot 6A: explicit rentable units. Occupancy is not stored and will be derived from active leases in Lot 6B.';
comment on table private.domain_events is
  'Internal non-localized domain facts. Lot 6A records PROPERTY_CREATED once per property.';
