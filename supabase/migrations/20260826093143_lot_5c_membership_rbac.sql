create table public.role_capabilities (
  role text not null check (role in (
    'organization_owner', 'manager', 'collector', 'caretaker', 'accountant', 'viewer'
  )),
  capability text not null check (capability in (
    'organization.view', 'organization.profile.manage',
    'member.view', 'member.manage',
    'property.view', 'property.manage',
    'tenant.view', 'tenant.manage',
    'lease.view', 'lease.manage',
    'due.view', 'payment.view', 'payment.record', 'payment.correction.request',
    'receipt.view', 'receipt.share', 'activity.view', 'audit.view',
    'tenant_portal.manage'
  )),
  primary key (role, capability)
);

insert into public.role_capabilities (role, capability) values
  ('organization_owner', 'organization.view'),
  ('organization_owner', 'organization.profile.manage'),
  ('organization_owner', 'member.view'),
  ('organization_owner', 'member.manage'),
  ('organization_owner', 'property.view'),
  ('organization_owner', 'property.manage'),
  ('organization_owner', 'tenant.view'),
  ('organization_owner', 'tenant.manage'),
  ('organization_owner', 'lease.view'),
  ('organization_owner', 'lease.manage'),
  ('organization_owner', 'due.view'),
  ('organization_owner', 'payment.view'),
  ('organization_owner', 'payment.record'),
  ('organization_owner', 'payment.correction.request'),
  ('organization_owner', 'receipt.view'),
  ('organization_owner', 'receipt.share'),
  ('organization_owner', 'activity.view'),
  ('organization_owner', 'audit.view'),
  ('organization_owner', 'tenant_portal.manage'),
  ('manager', 'organization.view'),
  ('manager', 'property.view'),
  ('manager', 'property.manage'),
  ('manager', 'tenant.view'),
  ('manager', 'tenant.manage'),
  ('manager', 'lease.view'),
  ('manager', 'lease.manage'),
  ('manager', 'due.view'),
  ('manager', 'payment.view'),
  ('manager', 'payment.record'),
  ('manager', 'payment.correction.request'),
  ('manager', 'receipt.view'),
  ('manager', 'receipt.share'),
  ('manager', 'activity.view'),
  ('manager', 'tenant_portal.manage'),
  ('collector', 'organization.view'),
  ('collector', 'property.view'),
  ('collector', 'tenant.view'),
  ('collector', 'lease.view'),
  ('collector', 'due.view'),
  ('collector', 'payment.view'),
  ('collector', 'payment.record'),
  ('collector', 'payment.correction.request'),
  ('collector', 'receipt.view'),
  ('collector', 'receipt.share'),
  ('collector', 'activity.view'),
  ('caretaker', 'organization.view'),
  ('caretaker', 'property.view'),
  ('caretaker', 'tenant.view'),
  ('caretaker', 'lease.view'),
  ('caretaker', 'activity.view'),
  ('accountant', 'organization.view'),
  ('accountant', 'property.view'),
  ('accountant', 'tenant.view'),
  ('accountant', 'lease.view'),
  ('accountant', 'due.view'),
  ('accountant', 'payment.view'),
  ('accountant', 'payment.correction.request'),
  ('accountant', 'receipt.view'),
  ('accountant', 'activity.view'),
  ('viewer', 'organization.view'),
  ('viewer', 'property.view'),
  ('viewer', 'tenant.view'),
  ('viewer', 'lease.view'),
  ('viewer', 'activity.view');

alter table public.memberships
  add column updated_at timestamptz not null default now(),
  add column revoked_at timestamptz;

create table public.membership_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(trim(email)) and char_length(email) between 3 and 320),
  role text not null check (role in (
    'organization_owner', 'manager', 'collector', 'caretaker', 'accountant', 'viewer'
  )),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  token_hash text not null unique,
  invited_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id),
  revoked_at timestamptz
);

create index membership_invitations_organization_idx
  on public.membership_invitations (organization_id, created_at desc);
create index membership_invitations_pending_email_idx
  on public.membership_invitations (organization_id, email)
  where status = 'pending';
create index membership_invitations_invited_by_idx
  on public.membership_invitations (invited_by);
create index membership_invitations_accepted_by_idx
  on public.membership_invitations (accepted_by)
  where accepted_by is not null;

create table public.administrative_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id),
  action text not null check (action in (
    'member.invited', 'member.invitation_resent', 'member.invitation_revoked',
    'member.invitation_accepted', 'member.role_changed', 'member.revoked',
    'owner.transferred'
  )),
  target_user_id uuid references auth.users (id),
  target_membership_id uuid references public.memberships (id),
  invitation_id uuid references public.membership_invitations (id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index administrative_audit_organization_idx
  on public.administrative_audit_log (organization_id, created_at desc);
create index administrative_audit_actor_idx
  on public.administrative_audit_log (actor_user_id);
create index administrative_audit_target_user_idx
  on public.administrative_audit_log (target_user_id)
  where target_user_id is not null;
create index administrative_audit_target_membership_idx
  on public.administrative_audit_log (target_membership_id)
  where target_membership_id is not null;
create index administrative_audit_invitation_idx
  on public.administrative_audit_log (invitation_id)
  where invitation_id is not null;
create index organizations_created_by_idx on public.organizations (created_by);

create trigger memberships_touch_updated_at
before update on public.memberships
for each row execute function private.touch_updated_at();

alter table public.role_capabilities enable row level security;
alter table public.membership_invitations enable row level security;
alter table public.administrative_audit_log enable row level security;

create or replace function private.has_capability(
  target_organization_id uuid,
  requested_capability text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_capabilities rc on rc.role = m.role
    where m.organization_id = target_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and rc.capability = requested_capability
  );
$$;

create or replace function private.write_administrative_audit(
  target_organization_id uuid,
  audit_action text,
  target_user uuid default null,
  target_membership uuid default null,
  target_invitation uuid default null,
  audit_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.administrative_audit_log (
    organization_id, actor_user_id, action, target_user_id,
    target_membership_id, invitation_id, details
  ) values (
    target_organization_id, (select auth.uid()), audit_action, target_user,
    target_membership, target_invitation, coalesce(audit_details, '{}'::jsonb)
  );
end;
$$;

create or replace function private.protect_last_organization_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active' and old.role = 'organization_owner'
    and (tg_op = 'DELETE' or new.status <> 'active' or new.role <> 'organization_owner')
    and not exists (
      select 1 from public.memberships
      where organization_id = old.organization_id
        and status = 'active'
        and role = 'organization_owner'
        and id <> old.id
    )
  then
    raise exception 'last_owner_protected' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger memberships_protect_last_owner
after update or delete on public.memberships
for each row execute function private.protect_last_organization_owner();

revoke all on function private.has_capability(uuid, text) from public, anon;
revoke all on function private.write_administrative_audit(uuid, text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.protect_last_organization_owner() from public, anon, authenticated;
grant execute on function private.has_capability(uuid, text) to authenticated;

drop policy if exists "users can read their own memberships" on public.memberships;
create policy "members read self and owners read team"
on public.memberships for select to authenticated
using (
  (user_id = (select auth.uid()) and status = 'active')
  or (select private.has_capability(organization_id, 'member.view'))
);

create policy "authenticated users read fixed capabilities"
on public.role_capabilities for select to authenticated
using ((select auth.uid()) is not null);

create policy "owners read organization invitations"
on public.membership_invitations for select to authenticated
using ((select private.has_capability(organization_id, 'member.view')));

create policy "owners read administrative audit"
on public.administrative_audit_log for select to authenticated
using ((select private.has_capability(organization_id, 'audit.view')));

revoke all on public.role_capabilities, public.membership_invitations, public.administrative_audit_log
  from public, anon, authenticated;
grant select (role, capability) on public.role_capabilities to authenticated;
grant select (id, organization_id, email, role, status, invited_by, created_at, expires_at, accepted_at, accepted_by, revoked_at)
  on public.membership_invitations to authenticated;
grant select (id, organization_id, actor_user_id, action, target_user_id, target_membership_id, invitation_id, details, created_at)
  on public.administrative_audit_log to authenticated;
grant select (id, organization_id, user_id, role, status, created_at, updated_at, revoked_at)
  on public.memberships to authenticated;

create or replace function public.list_organization_members(target_organization_id uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  email text,
  role text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.has_capability(target_organization_id, 'member.view')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select m.id, m.user_id, u.email::text, m.role, m.status, m.created_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = target_organization_id
    order by (m.role = 'organization_owner') desc, lower(coalesce(u.email, '')), m.created_at;
end;
$$;

create or replace function public.list_organization_invitations(target_organization_id uuid)
returns table (
  invitation_id uuid,
  email text,
  role text,
  status text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.has_capability(target_organization_id, 'member.view')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select i.id, i.email, i.role,
      case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end,
      i.created_at, i.expires_at
    from public.membership_invitations i
    where i.organization_id = target_organization_id
    order by i.created_at desc;
end;
$$;

create or replace function public.list_administrative_audit(
  target_organization_id uuid,
  result_limit integer default 25
)
returns table (
  audit_id uuid,
  action text,
  actor_email text,
  target_email text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.has_capability(target_organization_id, 'audit.view')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select a.id, a.action, actor.email::text, target.email::text, a.created_at
    from public.administrative_audit_log a
    left join auth.users actor on actor.id = a.actor_user_id
    left join auth.users target on target.id = a.target_user_id
    where a.organization_id = target_organization_id
    order by a.created_at desc
    limit greatest(1, least(coalesce(result_limit, 25), 100));
end;
$$;

create or replace function public.create_membership_invitation(
  target_organization_id uuid,
  invited_email text,
  invited_role text
)
returns table (invitation_id uuid, invitation_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(invited_email));
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  new_invitation_id uuid;
  new_expires_at timestamptz := now() + interval '7 days';
begin
  if not (select private.has_capability(target_organization_id, 'member.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if invited_role not in ('organization_owner', 'manager', 'collector', 'caretaker', 'accountant', 'viewer') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if char_length(normalized_email) not between 3 and 320 or position('@' in normalized_email) < 2 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  perform 1 from public.organizations where id = target_organization_id for update;
  if exists (
    select 1 from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = target_organization_id
      and m.status = 'active'
      and lower(u.email) = normalized_email
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;
  update public.membership_invitations
    set status = 'revoked', revoked_at = now()
    where organization_id = target_organization_id
      and email = normalized_email
      and status = 'pending';
  insert into public.membership_invitations (
    organization_id, email, role, token_hash, invited_by, expires_at
  ) values (
    target_organization_id, normalized_email, invited_role,
    encode(extensions.digest(convert_to(raw_token, 'utf8'), 'sha256'), 'hex'),
    (select auth.uid()), new_expires_at
  ) returning id into new_invitation_id;
  perform private.write_administrative_audit(
    target_organization_id, 'member.invited', null, null, new_invitation_id,
    jsonb_build_object('role', invited_role)
  );
  return query select new_invitation_id, raw_token, new_expires_at;
end;
$$;

create or replace function public.resend_membership_invitation(target_invitation_id uuid)
returns table (
  invitation_id uuid,
  invitation_email text,
  invitation_role text,
  invitation_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous public.membership_invitations%rowtype;
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  new_invitation_id uuid;
  new_expires_at timestamptz := now() + interval '7 days';
begin
  select * into previous from public.membership_invitations where id = target_invitation_id for update;
  if previous.id is null or not (select private.has_capability(previous.organization_id, 'member.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if previous.status = 'accepted' then
    raise exception 'invitation_already_used' using errcode = '22023';
  end if;
  perform 1 from public.organizations where id = previous.organization_id for update;
  update public.membership_invitations
    set status = 'revoked', revoked_at = now()
    where organization_id = previous.organization_id
      and email = previous.email
      and status = 'pending';
  insert into public.membership_invitations (
    organization_id, email, role, token_hash, invited_by, expires_at
  ) values (
    previous.organization_id, previous.email, previous.role,
    encode(extensions.digest(convert_to(raw_token, 'utf8'), 'sha256'), 'hex'),
    (select auth.uid()), new_expires_at
  ) returning id into new_invitation_id;
  perform private.write_administrative_audit(
    previous.organization_id, 'member.invitation_resent', null, null, new_invitation_id,
    jsonb_build_object('role', previous.role)
  );
  return query select new_invitation_id, previous.email, previous.role, raw_token, new_expires_at;
end;
$$;

create or replace function public.revoke_membership_invitation(target_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.membership_invitations%rowtype;
begin
  select * into invitation from public.membership_invitations where id = target_invitation_id for update;
  if invitation.id is null or not (select private.has_capability(invitation.organization_id, 'member.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if invitation.status <> 'pending' then
    raise exception 'invitation_not_pending' using errcode = '22023';
  end if;
  update public.membership_invitations set status = 'revoked', revoked_at = now()
    where id = target_invitation_id;
  perform private.write_administrative_audit(
    invitation.organization_id, 'member.invitation_revoked', null, null, invitation.id,
    jsonb_build_object('role', invitation.role)
  );
end;
$$;

create or replace function public.inspect_membership_invitation(invitation_token text)
returns table (organization_id uuid, organization_name text, invited_email text, invited_role text, expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_email text;
begin
  select lower(email) into current_email from auth.users where id = (select auth.uid()) and email_confirmed_at is not null;
  if current_email is null then raise exception 'verified_identity_required' using errcode = '42501'; end if;
  return query
    select i.organization_id, p.name, i.email, i.role, i.expires_at
    from public.membership_invitations i
    join public.organization_profiles p on p.organization_id = i.organization_id
    where i.token_hash = encode(extensions.digest(convert_to(invitation_token, 'utf8'), 'sha256'), 'hex')
      and i.email = current_email
      and i.status = 'pending'
      and i.expires_at > now();
end;
$$;

create or replace function public.accept_membership_invitation(invitation_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.membership_invitations%rowtype;
  current_user_id uuid := (select auth.uid());
  current_email text;
  accepted_membership_id uuid;
begin
  select lower(email) into current_email from auth.users
    where id = current_user_id and email_confirmed_at is not null;
  if current_email is null then raise exception 'verified_identity_required' using errcode = '42501'; end if;
  select * into invitation from public.membership_invitations
    where token_hash = encode(extensions.digest(convert_to(invitation_token, 'utf8'), 'sha256'), 'hex')
    for update;
  if invitation.id is null or invitation.email <> current_email then
    raise exception 'invalid_invitation' using errcode = '42501';
  end if;
  if invitation.status <> 'pending' then raise exception 'invitation_already_used' using errcode = '22023'; end if;
  if invitation.expires_at <= now() then raise exception 'invitation_expired' using errcode = '22023'; end if;
  perform 1 from public.organizations where id = invitation.organization_id for update;
  insert into public.memberships (organization_id, user_id, role, status, revoked_at)
    values (invitation.organization_id, current_user_id, invitation.role, 'active', null)
    on conflict (organization_id, user_id) do update
      set role = excluded.role, status = 'active', revoked_at = null
    returning id into accepted_membership_id;
  update public.membership_invitations
    set status = 'accepted', accepted_at = now(), accepted_by = current_user_id
    where id = invitation.id;
  perform private.write_administrative_audit(
    invitation.organization_id, 'member.invitation_accepted', current_user_id,
    accepted_membership_id, invitation.id, jsonb_build_object('role', invitation.role)
  );
  return invitation.organization_id;
end;
$$;

create or replace function public.change_membership_role(
  target_organization_id uuid,
  target_membership_id uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership public.memberships%rowtype;
begin
  if not (select private.has_capability(target_organization_id, 'member.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if new_role not in ('organization_owner', 'manager', 'collector', 'caretaker', 'accountant', 'viewer') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  perform 1 from public.organizations where id = target_organization_id for update;
  select * into membership from public.memberships
    where id = target_membership_id and organization_id = target_organization_id and status = 'active'
    for update;
  if membership.id is null then raise exception 'membership_not_found' using errcode = '22023'; end if;
  if membership.role = new_role then return; end if;
  update public.memberships set role = new_role where id = target_membership_id;
  perform private.write_administrative_audit(
    target_organization_id, 'member.role_changed', membership.user_id, membership.id, null,
    jsonb_build_object('from', membership.role, 'to', new_role)
  );
end;
$$;

create or replace function public.revoke_membership(
  target_organization_id uuid,
  target_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership public.memberships%rowtype;
begin
  if not (select private.has_capability(target_organization_id, 'member.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform 1 from public.organizations where id = target_organization_id for update;
  select * into membership from public.memberships
    where id = target_membership_id and organization_id = target_organization_id and status = 'active'
    for update;
  if membership.id is null then raise exception 'membership_not_found' using errcode = '22023'; end if;
  update public.memberships set status = 'revoked', revoked_at = now() where id = membership.id;
  perform private.write_administrative_audit(
    target_organization_id, 'member.revoked', membership.user_id, membership.id, null,
    jsonb_build_object('role', membership.role)
  );
end;
$$;

create or replace function public.transfer_organization_ownership(
  target_organization_id uuid,
  target_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  source_membership public.memberships%rowtype;
  target_membership public.memberships%rowtype;
begin
  if not (select private.has_capability(target_organization_id, 'member.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform 1 from public.organizations where id = target_organization_id for update;
  select * into source_membership from public.memberships
    where organization_id = target_organization_id and user_id = current_user_id
      and status = 'active' and role = 'organization_owner' for update;
  select * into target_membership from public.memberships
    where id = target_membership_id and organization_id = target_organization_id
      and status = 'active' and user_id <> current_user_id for update;
  if source_membership.id is null or target_membership.id is null then
    raise exception 'invalid_owner_transfer' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = target_membership.user_id and email_confirmed_at is not null) then
    raise exception 'verified_target_required' using errcode = '42501';
  end if;
  update public.memberships set role = 'organization_owner' where id = target_membership.id;
  update public.memberships set role = 'manager' where id = source_membership.id;
  perform private.write_administrative_audit(
    target_organization_id, 'owner.transferred', target_membership.user_id,
    target_membership.id, null,
    jsonb_build_object('previous_owner_user_id', current_user_id)
  );
end;
$$;

revoke all on function public.list_organization_members(uuid) from public, anon;
revoke all on function public.list_organization_invitations(uuid) from public, anon;
revoke all on function public.list_administrative_audit(uuid, integer) from public, anon;
revoke all on function public.create_membership_invitation(uuid, text, text) from public, anon;
revoke all on function public.resend_membership_invitation(uuid) from public, anon;
revoke all on function public.revoke_membership_invitation(uuid) from public, anon;
revoke all on function public.inspect_membership_invitation(text) from public, anon;
revoke all on function public.accept_membership_invitation(text) from public, anon;
revoke all on function public.change_membership_role(uuid, uuid, text) from public, anon;
revoke all on function public.revoke_membership(uuid, uuid) from public, anon;
revoke all on function public.transfer_organization_ownership(uuid, uuid) from public, anon;

grant execute on function public.list_organization_members(uuid) to authenticated;
grant execute on function public.list_organization_invitations(uuid) to authenticated;
grant execute on function public.list_administrative_audit(uuid, integer) to authenticated;
grant execute on function public.create_membership_invitation(uuid, text, text) to authenticated;
grant execute on function public.resend_membership_invitation(uuid) to authenticated;
grant execute on function public.revoke_membership_invitation(uuid) to authenticated;
grant execute on function public.inspect_membership_invitation(text) to authenticated;
grant execute on function public.accept_membership_invitation(text) to authenticated;
grant execute on function public.change_membership_role(uuid, uuid, text) to authenticated;
grant execute on function public.revoke_membership(uuid, uuid) to authenticated;
grant execute on function public.transfer_organization_ownership(uuid, uuid) to authenticated;

comment on table public.role_capabilities is
  'Lot 5C: versioned fixed-role capability source of truth; no per-Organization custom roles.';
comment on table public.membership_invitations is
  'Lot 5C: internal Organization invitations; token hashes only, seven-day expiry, no permission before acceptance.';
comment on table public.administrative_audit_log is
  'Lot 5C: tenant-scoped administrative audit visible only to Organization Owner.';
