create extension if not exists btree_gist with schema extensions;

alter table public.units
  add constraint units_organization_property_id_key
  unique (organization_id, property_id, id);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  phone text check (phone is null or char_length(trim(phone)) between 6 and 32),
  email text check (
    email is null
    or (email = lower(trim(email)) and char_length(email) between 3 and 320 and position('@' in email) > 1)
  ),
  preferred_language text check (preferred_language is null or preferred_language in ('fr', 'en')),
  profession text check (profession is null or char_length(trim(profession)) between 2 and 120),
  identity_document_type text check (
    identity_document_type is null or identity_document_type in ('cni', 'passport', 'other')
  ),
  identity_document_number text check (
    identity_document_number is null or char_length(trim(identity_document_number)) between 2 and 80
  ),
  identity_document_expires_on date,
  internal_notes text check (internal_notes is null or char_length(internal_notes) <= 4000),
  avatar_storage_path text,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_organization_id_id_key unique (organization_id, id),
  constraint tenants_contact_required check (
    nullif(trim(coalesce(phone, '')), '') is not null
    or nullif(trim(coalesce(email, '')), '') is not null
  ),
  constraint tenants_identity_pair check (
    (identity_document_type is null and identity_document_number is null)
    or (identity_document_type is not null and identity_document_number is not null)
  ),
  constraint tenants_avatar_deferred check (avatar_storage_path is null)
);

create table public.leases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  property_id uuid not null,
  unit_id uuid not null,
  tenant_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'ended')),
  start_date date not null,
  end_date date,
  ended_on date,
  base_rent_xaf bigint not null check (base_rent_xaf > 0),
  recurring_charges_xaf bigint not null default 0 check (recurring_charges_xaf >= 0),
  periodic_total_xaf bigint generated always as (base_rent_xaf + recurring_charges_xaf) stored,
  security_deposit_xaf bigint not null default 0 check (security_deposit_xaf >= 0),
  initial_prepayment_periods numeric(6, 2) not null default 0 check (initial_prepayment_periods >= 0),
  initial_prepayment_amount_xaf bigint not null default 0 check (initial_prepayment_amount_xaf >= 0),
  billing_frequency text not null check (billing_frequency in ('monthly', 'quarterly', 'semiannual', 'annual')),
  due_day smallint not null check (due_day between 1 and 31),
  generate_due_days_before smallint not null default 5 check (generate_due_days_before between 0 and 90),
  overdue_reminder_days_after smallint not null default 1 check (overdue_reminder_days_after between 1 and 90),
  entry_proration_mode text not null default 'none' check (entry_proration_mode in ('none', 'calendar_days')),
  exit_proration_mode text not null default 'none' check (exit_proration_mode in ('none', 'calendar_days')),
  entry_proration_override_xaf bigint check (entry_proration_override_xaf is null or entry_proration_override_xaf >= 0),
  entry_proration_override_reason text check (
    entry_proration_override_reason is null or char_length(trim(entry_proration_override_reason)) between 3 and 500
  ),
  exit_proration_override_xaf bigint check (exit_proration_override_xaf is null or exit_proration_override_xaf >= 0),
  exit_proration_override_reason text check (
    exit_proration_override_reason is null or char_length(trim(exit_proration_override_reason)) between 3 and 500
  ),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  ended_at timestamptz,
  constraint leases_organization_id_id_key unique (organization_id, id),
  constraint leases_tenant_tenant_fk foreign key (organization_id, tenant_id)
    references public.tenants (organization_id, id) on delete restrict,
  constraint leases_unit_tenant_fk foreign key (organization_id, property_id, unit_id)
    references public.units (organization_id, property_id, id) on delete restrict,
  constraint leases_dates_consistent check (end_date is null or end_date >= start_date),
  constraint leases_end_state_consistent check (
    (status = 'draft' and activated_at is null and ended_at is null and ended_on is null)
    or (status = 'active' and activated_at is not null and ended_at is null and ended_on is null)
    or (status = 'ended' and activated_at is not null and ended_at is not null and ended_on is not null)
  ),
  constraint leases_ended_date_consistent check (ended_on is null or ended_on >= start_date),
  constraint leases_entry_override_reason check (
    (entry_proration_override_xaf is null and entry_proration_override_reason is null)
    or (entry_proration_override_xaf is not null and entry_proration_override_reason is not null)
  ),
  constraint leases_exit_override_reason check (
    (exit_proration_override_xaf is null and exit_proration_override_reason is null)
    or (exit_proration_override_xaf is not null and exit_proration_override_reason is not null)
  ),
  constraint leases_active_period_no_overlap exclude using gist (
    organization_id with =,
    unit_id with =,
    daterange(
      start_date,
      case when status = 'ended' then ended_on else coalesce(end_date, 'infinity'::date) end,
      '[]'
    ) with &&
  ) where (status in ('active', 'ended'))
);

create index tenants_organization_created_idx on public.tenants (organization_id, created_at desc);
create index tenants_created_by_idx on public.tenants (created_by);
create index leases_organization_status_created_idx on public.leases (organization_id, status, created_at desc);
create index leases_tenant_idx on public.leases (organization_id, tenant_id, created_at desc);
create index leases_property_unit_idx on public.leases (organization_id, property_id, unit_id, status);
create index leases_created_by_idx on public.leases (created_by);

alter table private.domain_events drop constraint domain_events_event_type_check;
alter table private.domain_events drop constraint domain_events_aggregate_type_check;
alter table private.domain_events add constraint domain_events_event_type_check
  check (event_type in ('PROPERTY_CREATED', 'TENANT_CREATED', 'LEASE_ACTIVATED'));
alter table private.domain_events add constraint domain_events_aggregate_type_check
  check (aggregate_type in ('property', 'tenant', 'lease'));

alter table public.tenants enable row level security;
alter table public.leases enable row level security;

create or replace function private.protect_tenant_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception 'tenant_organization_immutable' using errcode = '23514';
  end if;
  if new.created_by <> old.created_by then
    raise exception 'tenant_creator_immutable' using errcode = '23514';
  end if;
  if new.avatar_storage_path is not null then
    raise exception 'tenant_avatar_storage_deferred' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.initialize_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.domain_events (
    organization_id, event_type, aggregate_type, aggregate_id, actor_user_id, payload
  ) values (
    new.organization_id,
    'TENANT_CREATED',
    'tenant',
    new.id,
    new.created_by,
    jsonb_build_object('tenant_id', new.id)
  ) on conflict (event_type, aggregate_id) do nothing;
  return new;
end;
$$;

create or replace function private.enforce_lease_invariants()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  selected_tenant boolean;
  selected_property boolean;
  selected_unit boolean;
begin
  select exists (
    select 1 from public.tenants t
    where t.organization_id = new.organization_id and t.id = new.tenant_id
  ) into selected_tenant;
  select exists (
    select 1 from public.properties p
    where p.organization_id = new.organization_id and p.id = new.property_id and p.status = 'active'
  ) into selected_property;
  select exists (
    select 1 from public.units u
    where u.organization_id = new.organization_id
      and u.property_id = new.property_id
      and u.id = new.unit_id
      and u.status = 'active'
  ) into selected_unit;

  if not selected_tenant then
    raise exception 'tenant_unavailable' using errcode = '23503';
  end if;
  if not selected_property or not selected_unit then
    raise exception 'unit_unavailable' using errcode = '23503';
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'active' and new.activated_at is null then
      new.activated_at := now();
    elsif new.status <> 'draft' then
      raise exception 'lease_must_start_draft' using errcode = '23514';
    end if;
  else
    if new.organization_id <> old.organization_id
      or new.property_id <> old.property_id
      or new.unit_id <> old.unit_id
      or new.tenant_id <> old.tenant_id
      or new.created_by <> old.created_by then
      raise exception 'lease_relationship_immutable' using errcode = '23514';
    end if;
    if old.status = 'ended' then
      raise exception 'lease_ended_immutable' using errcode = '23514';
    end if;
    if old.status = 'active' and new.status not in ('active', 'ended') then
      raise exception 'lease_invalid_transition' using errcode = '23514';
    end if;
    if old.status = 'draft' and new.status = 'ended' then
      raise exception 'lease_invalid_transition' using errcode = '23514';
    end if;
    if old.status = 'active' and (
      new.start_date <> old.start_date
      or new.end_date is distinct from old.end_date
      or new.base_rent_xaf <> old.base_rent_xaf
      or new.recurring_charges_xaf <> old.recurring_charges_xaf
      or new.security_deposit_xaf <> old.security_deposit_xaf
      or new.initial_prepayment_periods <> old.initial_prepayment_periods
      or new.initial_prepayment_amount_xaf <> old.initial_prepayment_amount_xaf
      or new.billing_frequency <> old.billing_frequency
      or new.due_day <> old.due_day
      or new.generate_due_days_before <> old.generate_due_days_before
      or new.overdue_reminder_days_after <> old.overdue_reminder_days_after
      or new.entry_proration_mode <> old.entry_proration_mode
      or new.exit_proration_mode <> old.exit_proration_mode
      or new.entry_proration_override_xaf is distinct from old.entry_proration_override_xaf
      or new.entry_proration_override_reason is distinct from old.entry_proration_override_reason
      or new.exit_proration_override_xaf is distinct from old.exit_proration_override_xaf
      or new.exit_proration_override_reason is distinct from old.exit_proration_override_reason
    ) then
      raise exception 'active_lease_terms_immutable' using errcode = '23514';
    end if;
    if old.status = 'draft' and new.status = 'active' then
      new.activated_at := now();
    end if;
    if old.status = 'active' and new.status = 'ended' then
      new.ended_at := now();
      new.ended_on := coalesce(new.ended_on, current_date);
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.prevent_archiving_occupied_unit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'archived' and old.status = 'active' and exists (
    select 1 from public.leases l
    where l.organization_id = old.organization_id
      and l.unit_id = old.id
      and l.status = 'active'
  ) then
    raise exception 'occupied_unit_cannot_be_archived' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.record_lease_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    insert into private.domain_events (
      organization_id, event_type, aggregate_type, aggregate_id, actor_user_id, payload
    ) values (
      new.organization_id,
      'LEASE_ACTIVATED',
      'lease',
      new.id,
      new.created_by,
      jsonb_build_object(
        'lease_id', new.id,
        'tenant_id', new.tenant_id,
        'property_id', new.property_id,
        'unit_id', new.unit_id
      )
    ) on conflict (event_type, aggregate_id) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.get_tenant_private_profile(target_tenant_id uuid)
returns table (
  tenant_id uuid,
  phone text,
  email text,
  preferred_language text,
  profession text,
  identity_document_type text,
  identity_document_number text,
  identity_document_expires_on date,
  internal_notes text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
begin
  select t.organization_id into target_organization_id
  from public.tenants t
  where t.id = target_tenant_id;

  if target_organization_id is null
    or not (select private.has_capability(target_organization_id, 'tenant.manage')) then
    return;
  end if;

  return query
  select t.id, t.phone, t.email, t.preferred_language, t.profession,
    t.identity_document_type, t.identity_document_number,
    t.identity_document_expires_on, t.internal_notes
  from public.tenants t
  where t.id = target_tenant_id and t.organization_id = target_organization_id;
end;
$$;

create or replace function public.list_tenant_profiles(target_organization_id uuid)
returns table (
  tenant_id uuid,
  full_name text,
  phone text,
  email text,
  preferred_language text,
  profession text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  can_manage boolean;
begin
  if not (select private.has_capability(target_organization_id, 'tenant.view')) then
    return;
  end if;
  can_manage := (select private.has_capability(target_organization_id, 'tenant.manage'));
  return query
  select t.id, t.full_name,
    case when can_manage then t.phone else null end,
    case when can_manage then t.email else null end,
    case when can_manage then t.preferred_language else null end,
    case when can_manage then t.profession else null end
  from public.tenants t
  where t.organization_id = target_organization_id
  order by t.created_at desc
  limit 500;
end;
$$;

create trigger tenants_protect_identity
before update on public.tenants
for each row execute function private.protect_tenant_identity();
create trigger tenants_touch_updated_at
before update on public.tenants
for each row execute function private.touch_updated_at();
create trigger tenants_initialize
after insert on public.tenants
for each row execute function private.initialize_tenant();

create trigger leases_enforce_invariants
before insert or update on public.leases
for each row execute function private.enforce_lease_invariants();
create trigger leases_touch_updated_at
before update on public.leases
for each row execute function private.touch_updated_at();
create trigger leases_record_activation
after insert or update of status on public.leases
for each row execute function private.record_lease_activation();
create trigger units_prevent_archiving_occupied
before update of status on public.units
for each row execute function private.prevent_archiving_occupied_unit();

revoke all on function private.protect_tenant_identity() from public, anon, authenticated;
revoke all on function private.initialize_tenant() from public, anon, authenticated;
revoke all on function private.enforce_lease_invariants() from public, anon, authenticated;
revoke all on function private.record_lease_activation() from public, anon, authenticated;
revoke all on function private.prevent_archiving_occupied_unit() from public, anon, authenticated;
revoke all on function public.get_tenant_private_profile(uuid) from public, anon;
grant execute on function public.get_tenant_private_profile(uuid) to authenticated;
revoke all on function public.list_tenant_profiles(uuid) from public, anon;
grant execute on function public.list_tenant_profiles(uuid) to authenticated;

create policy "authorized members read tenants"
on public.tenants for select to authenticated
using ((select private.has_capability(organization_id, 'tenant.view')));

create policy "authorized members create tenants"
on public.tenants for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.has_capability(organization_id, 'tenant.manage'))
);

create policy "authorized members update tenants"
on public.tenants for update to authenticated
using ((select private.has_capability(organization_id, 'tenant.manage')))
with check ((select private.has_capability(organization_id, 'tenant.manage')));

create policy "authorized members read leases"
on public.leases for select to authenticated
using ((select private.has_capability(organization_id, 'lease.view')));

create policy "authorized members create leases"
on public.leases for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'draft'
  and (select private.has_capability(organization_id, 'lease.manage'))
);

create policy "authorized members update leases"
on public.leases for update to authenticated
using ((select private.has_capability(organization_id, 'lease.manage')))
with check ((select private.has_capability(organization_id, 'lease.manage')));

revoke all on table public.tenants, public.leases from public, anon, authenticated;
grant select (
  id, organization_id, full_name, created_at, updated_at
) on public.tenants to authenticated;
grant insert (
  id, organization_id, full_name, phone, email, preferred_language, profession,
  identity_document_type, identity_document_number, identity_document_expires_on,
  internal_notes, created_by
) on public.tenants to authenticated;
grant update (
  full_name, phone, email, preferred_language, profession,
  identity_document_type, identity_document_number, identity_document_expires_on,
  internal_notes
) on public.tenants to authenticated;

grant select on public.leases to authenticated;
grant insert (
  id, organization_id, property_id, unit_id, tenant_id, status, start_date, end_date,
  base_rent_xaf, recurring_charges_xaf, security_deposit_xaf,
  initial_prepayment_periods, initial_prepayment_amount_xaf, billing_frequency,
  due_day, generate_due_days_before, overdue_reminder_days_after,
  entry_proration_mode, exit_proration_mode,
  entry_proration_override_xaf, entry_proration_override_reason,
  exit_proration_override_xaf, exit_proration_override_reason, created_by
) on public.leases to authenticated;
grant update (
  status, start_date, end_date, ended_on,
  base_rent_xaf, recurring_charges_xaf, security_deposit_xaf,
  initial_prepayment_periods, initial_prepayment_amount_xaf, billing_frequency,
  due_day, generate_due_days_before, overdue_reminder_days_after,
  entry_proration_mode, exit_proration_mode,
  entry_proration_override_xaf, entry_proration_override_reason,
  exit_proration_override_xaf, exit_proration_override_reason
) on public.leases to authenticated;

comment on table public.tenants is
  'Lot 6B: tenant-scoped real tenant profiles. Avatar and identity scan Storage remain deferred.';
comment on table public.leases is
  'Lot 6B: tenant-scoped real leases. Occupancy derives only from active rows; no dues, ledger or payments are created.';
comment on function public.get_tenant_private_profile(uuid) is
  'Lot 6B: capability-checked projection for identity metadata and internal notes.';
comment on function public.list_tenant_profiles(uuid) is
  'Lot 6B: tenant.view list projection; personal contacts are present only with tenant.manage.';
comment on table private.domain_events is
  'Internal non-localized domain facts. Lot 6B adds TENANT_CREATED and LEASE_ACTIVATED.';
