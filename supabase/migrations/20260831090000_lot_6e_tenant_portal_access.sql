-- LOT 6E — Tenant Portal Access (local migration; not applied to Production).
-- The portal reads the existing Lease/Due/Payment/Document truths through narrow RPCs.

create table public.tenant_portal_accesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  tenant_id uuid not null,
  user_id uuid references auth.users (id) on delete restrict,
  status text not null default 'invited' check (status in ('invited', 'active', 'revoked')),
  invited_email text not null check (
    invited_email = lower(trim(invited_email)) and char_length(invited_email) between 3 and 320
    and position('@' in invited_email) > 1
  ),
  preferred_language text not null check (preferred_language in ('fr', 'en')),
  invited_by uuid not null references auth.users (id),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_portal_accesses_org_tenant_key unique (organization_id, tenant_id),
  constraint tenant_portal_accesses_org_id_key unique (organization_id, id),
  constraint tenant_portal_accesses_org_id_tenant_key unique (organization_id, id, tenant_id),
  constraint tenant_portal_accesses_tenant_fk foreign key (organization_id, tenant_id)
    references public.tenants (organization_id, id) on delete restrict,
  constraint tenant_portal_accesses_state check (
    (status = 'invited' and user_id is null and accepted_at is null and revoked_at is null)
    or (status = 'active' and user_id is not null and accepted_at is not null and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  )
);

-- Composite parent keys make the portal child scopes enforce Organization +
-- Tenant at the database boundary, not only inside the RPC predicates.
alter table public.leases
  add constraint leases_organization_id_id_tenant_key unique (organization_id, id, tenant_id);
alter table public.financial_documents
  add constraint financial_documents_organization_id_id_tenant_key unique (organization_id, id, tenant_id);

create table public.tenant_portal_lease_accesses (
  organization_id uuid not null,
  access_id uuid not null,
  tenant_id uuid not null,
  lease_id uuid not null,
  granted_by uuid not null references auth.users (id),
  granted_at timestamptz not null default now(),
  primary key (organization_id, access_id, lease_id),
  constraint tenant_portal_lease_accesses_access_fk foreign key (organization_id, access_id, tenant_id)
    references public.tenant_portal_accesses (organization_id, id, tenant_id) on delete cascade,
  constraint tenant_portal_lease_accesses_tenant_fk foreign key (organization_id, tenant_id)
    references public.tenants (organization_id, id) on delete restrict,
  constraint tenant_portal_lease_accesses_lease_fk foreign key (organization_id, lease_id, tenant_id)
    references public.leases (organization_id, id, tenant_id) on delete restrict
);

create table public.tenant_portal_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  access_id uuid not null,
  tenant_id uuid not null,
  email text not null check (
    email = lower(trim(email)) and char_length(email) between 3 and 320 and position('@' in email) > 1
  ),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id),
  revoked_at timestamptz,
  constraint tenant_portal_invitations_access_fk foreign key (organization_id, access_id, tenant_id)
    references public.tenant_portal_accesses (organization_id, id, tenant_id) on delete cascade,
  constraint tenant_portal_invitations_tenant_fk foreign key (organization_id, tenant_id)
    references public.tenants (organization_id, id) on delete restrict,
  constraint tenant_portal_invitations_state check (
    (status = 'pending' and accepted_at is null and accepted_by is null and revoked_at is null)
    or (status = 'accepted' and accepted_at is not null and accepted_by is not null and revoked_at is null)
    or (status in ('revoked', 'expired') and accepted_at is null and accepted_by is null and revoked_at is not null)
  )
);

create unique index tenant_portal_pending_invitation_idx
  on public.tenant_portal_invitations (access_id) where status = 'pending';

create table public.tenant_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  access_id uuid not null,
  tenant_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  auth_session_id text not null check (char_length(auth_session_id) between 8 and 200),
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tenant_portal_sessions_access_fk foreign key (organization_id, access_id, tenant_id)
    references public.tenant_portal_accesses (organization_id, id, tenant_id) on delete cascade,
  constraint tenant_portal_sessions_tenant_fk foreign key (organization_id, tenant_id)
    references public.tenants (organization_id, id) on delete restrict,
  constraint tenant_portal_sessions_access_auth_key unique (access_id, auth_session_id),
  constraint tenant_portal_sessions_expiry check (expires_at <= verified_at + interval '30 days')
);

create table public.tenant_portal_document_views (
  organization_id uuid not null,
  access_id uuid not null,
  tenant_id uuid not null,
  document_id uuid not null,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  primary key (organization_id, access_id, document_id),
  constraint tenant_portal_document_views_access_fk foreign key (organization_id, access_id, tenant_id)
    references public.tenant_portal_accesses (organization_id, id, tenant_id) on delete cascade,
  constraint tenant_portal_document_views_tenant_fk foreign key (organization_id, tenant_id)
    references public.tenants (organization_id, id) on delete restrict,
  constraint tenant_portal_document_views_document_fk foreign key (organization_id, document_id, tenant_id)
    references public.financial_documents (organization_id, id, tenant_id) on delete restrict
);

create table private.tenant_portal_access_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  tenant_id uuid not null,
  access_id uuid,
  invitation_id uuid,
  session_id uuid,
  actor_user_id uuid references auth.users (id),
  event_type text not null check (event_type in (
    'invitation_sent', 'invitation_opened', 'invitation_accepted', 'invitation_revoked',
    'login_succeeded', 'login_refused', 'new_device', 'access_revoked', 'access_reactivated', 'session_expired'
  )),
  outcome text not null check (outcome in ('succeeded', 'refused')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default now(),
  constraint tenant_portal_access_log_tenant_fk foreign key (organization_id, tenant_id)
    references public.tenants (organization_id, id) on delete restrict
);

create index tenant_portal_accesses_user_idx
  on public.tenant_portal_accesses (user_id, status, organization_id) where user_id is not null;
create index tenant_portal_accesses_invited_by_idx
  on public.tenant_portal_accesses (invited_by);
create index tenant_portal_lease_accesses_lease_idx
  on public.tenant_portal_lease_accesses (organization_id, lease_id, access_id);
create index tenant_portal_lease_accesses_tenant_idx
  on public.tenant_portal_lease_accesses (organization_id, tenant_id, lease_id);
create index tenant_portal_lease_accesses_granted_by_idx
  on public.tenant_portal_lease_accesses (granted_by);
create index tenant_portal_invitations_access_created_idx
  on public.tenant_portal_invitations (access_id, created_at desc);
create index tenant_portal_invitations_tenant_idx
  on public.tenant_portal_invitations (organization_id, tenant_id, created_at desc);
create index tenant_portal_invitations_invited_by_idx
  on public.tenant_portal_invitations (invited_by);
create index tenant_portal_invitations_accepted_by_idx
  on public.tenant_portal_invitations (accepted_by) where accepted_by is not null;
create index tenant_portal_sessions_lookup_idx
  on public.tenant_portal_sessions (user_id, auth_session_id, access_id, expires_at) where revoked_at is null;
create index tenant_portal_sessions_access_idx
  on public.tenant_portal_sessions (organization_id, access_id, tenant_id);
create index tenant_portal_sessions_tenant_idx
  on public.tenant_portal_sessions (organization_id, tenant_id);
create index tenant_portal_document_views_document_idx
  on public.tenant_portal_document_views (organization_id, document_id, tenant_id);
create index tenant_portal_document_views_tenant_idx
  on public.tenant_portal_document_views (organization_id, tenant_id);
create index tenant_portal_access_log_retention_idx
  on private.tenant_portal_access_log (occurred_at);
create index tenant_portal_access_log_access_idx
  on private.tenant_portal_access_log (organization_id, access_id, occurred_at desc);
create index tenant_portal_access_log_tenant_idx
  on private.tenant_portal_access_log (organization_id, tenant_id, occurred_at desc);
create index tenant_portal_access_log_actor_idx
  on private.tenant_portal_access_log (actor_user_id) where actor_user_id is not null;

alter table public.tenant_portal_accesses enable row level security;
alter table public.tenant_portal_lease_accesses enable row level security;
alter table public.tenant_portal_invitations enable row level security;
alter table public.tenant_portal_sessions enable row level security;
alter table public.tenant_portal_document_views enable row level security;
alter table private.tenant_portal_access_log enable row level security;

create or replace function private.current_portal_auth_session_id()
returns text language sql stable security definer set search_path = '' as $$
  select nullif((select auth.jwt()) ->> 'session_id', '');
$$;

create or replace function private.log_tenant_portal_access(
  target_organization_id uuid, target_tenant_id uuid, target_access_id uuid,
  target_invitation_id uuid, target_session_id uuid, target_event_type text,
  target_outcome text, target_details jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from private.tenant_portal_access_log where occurred_at < now() - interval '12 months';
  insert into private.tenant_portal_access_log (
    organization_id, tenant_id, access_id, invitation_id, session_id,
    actor_user_id, event_type, outcome, details
  ) values (
    target_organization_id, target_tenant_id, target_access_id, target_invitation_id,
    target_session_id, (select auth.uid()), target_event_type, target_outcome,
    coalesce(target_details, '{}'::jsonb)
  );
end;
$$;

create or replace function private.expire_tenant_portal_invitations()
returns integer language plpgsql security definer set search_path = '' as $$
declare expired_count integer;
begin
  update public.tenant_portal_invitations
    set status = 'expired', revoked_at = now()
    where status = 'pending' and expires_at <= now();
  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

create or replace function private.has_active_tenant_portal_access(target_access_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.tenant_portal_accesses a
    join public.tenant_portal_sessions s
      on s.organization_id = a.organization_id and s.access_id = a.id and s.tenant_id = a.tenant_id
    where a.id = target_access_id and a.status = 'active' and a.user_id = (select auth.uid())
      and s.user_id = (select auth.uid()) and s.auth_session_id = (select private.current_portal_auth_session_id())
      and s.revoked_at is null and s.expires_at > now()
  );
$$;

create or replace function private.has_tenant_portal_lease_access(target_access_id uuid, target_lease_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.has_active_tenant_portal_access(target_access_id)) and exists (
    select 1 from public.tenant_portal_lease_accesses la
    join public.tenant_portal_accesses a
      on a.organization_id = la.organization_id and a.id = la.access_id and a.tenant_id = la.tenant_id
    join public.leases l
      on l.organization_id = la.organization_id and l.id = la.lease_id and l.tenant_id = la.tenant_id
    where la.access_id = target_access_id and la.lease_id = target_lease_id
  );
$$;

alter table public.administrative_audit_log drop constraint administrative_audit_log_action_check;
alter table public.administrative_audit_log add constraint administrative_audit_log_action_check check (action in (
  'member.invited', 'member.invitation_resent', 'member.invitation_revoked',
  'member.invitation_accepted', 'member.role_changed', 'member.revoked', 'owner.transferred',
  'payment.reversed', 'document.invalidated',
  'tenant_portal.invited', 'tenant_portal.invitation_resent',
  'tenant_portal.invitation_accepted', 'tenant_portal.revoked', 'tenant_portal.reactivated'
));

create or replace function public.create_tenant_portal_invitation(
  target_tenant_id uuid, target_lease_ids uuid[]
)
returns table (access_id uuid, invitation_id uuid, invitation_email text, invitation_language text, invitation_token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  selected_tenant public.tenants%rowtype;
  selected_access public.tenant_portal_accesses%rowtype;
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  new_invitation_id uuid;
  new_expires_at timestamptz := now() + interval '7 days';
  normalized_email text;
  was_revoked boolean := false;
begin
  select * into selected_tenant from public.tenants where id = target_tenant_id for update;
  if selected_tenant.id is null or not (select private.has_capability(selected_tenant.organization_id, 'tenant_portal.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  normalized_email := lower(trim(coalesce(selected_tenant.email, '')));
  if char_length(normalized_email) not between 3 and 320 or position('@' in normalized_email) < 2 then
    raise exception 'verified_email_required' using errcode = '22023';
  end if;
  if coalesce(array_length(target_lease_ids, 1), 0) = 0 or (
    select count(*) from public.leases l
    where l.id = any(target_lease_ids) and l.organization_id = selected_tenant.organization_id
      and l.tenant_id = selected_tenant.id and l.status in ('active', 'ended')
  ) <> (select count(distinct requested.value) from unnest(target_lease_ids) as requested(value)) then
    raise exception 'invalid_lease_scope' using errcode = '22023';
  end if;

  select * into selected_access from public.tenant_portal_accesses
    where organization_id = selected_tenant.organization_id and tenant_id = selected_tenant.id for update;
  was_revoked := selected_access.id is not null and selected_access.status = 'revoked';
  if selected_access.id is null then
    insert into public.tenant_portal_accesses (
      organization_id, tenant_id, invited_email, preferred_language, invited_by
    ) values (
      selected_tenant.organization_id, selected_tenant.id, normalized_email,
      coalesce(selected_tenant.preferred_language,
        (select op.language from public.organization_profiles op where op.organization_id = selected_tenant.organization_id), 'fr'),
      (select auth.uid())
    ) returning * into selected_access;
  elsif selected_access.status = 'active' then
    raise exception 'access_already_active' using errcode = '22023';
  else
    update public.tenant_portal_accesses set status = 'invited', user_id = null,
      invited_email = normalized_email, preferred_language = coalesce(selected_tenant.preferred_language,
        (select op.language from public.organization_profiles op where op.organization_id = selected_tenant.organization_id), 'fr'),
      invited_by = (select auth.uid()), invited_at = now(), accepted_at = null, revoked_at = null, updated_at = now()
    where id = selected_access.id returning * into selected_access;
  end if;

  delete from public.tenant_portal_lease_accesses where access_id = selected_access.id;
  insert into public.tenant_portal_lease_accesses (organization_id, access_id, tenant_id, lease_id, granted_by)
    select selected_tenant.organization_id, selected_access.id, selected_tenant.id, value, (select auth.uid())
    from (select distinct unnest(target_lease_ids) as value) requested;
  update public.tenant_portal_invitations set status = 'revoked', revoked_at = now()
    where access_id = selected_access.id and status = 'pending';
  insert into public.tenant_portal_invitations (
    organization_id, access_id, tenant_id, email, token_hash, invited_by, expires_at
  ) values (
    selected_tenant.organization_id, selected_access.id, selected_tenant.id, normalized_email,
    encode(extensions.digest(convert_to(raw_token, 'utf8'), 'sha256'), 'hex'), (select auth.uid()), new_expires_at
  ) returning id into new_invitation_id;
  perform private.write_administrative_audit(
    selected_tenant.organization_id,
    case when was_revoked then 'tenant_portal.reactivated' else 'tenant_portal.invited' end,
    null, null, null,
    jsonb_build_object('tenant_id', selected_tenant.id, 'access_id', selected_access.id)
  );
  if was_revoked then
    perform private.log_tenant_portal_access(selected_tenant.organization_id, selected_tenant.id,
      selected_access.id, new_invitation_id, null, 'access_reactivated', 'succeeded');
  end if;
  perform private.log_tenant_portal_access(selected_tenant.organization_id, selected_tenant.id,
    selected_access.id, new_invitation_id, null, 'invitation_sent', 'succeeded');
  return query select selected_access.id, new_invitation_id, normalized_email,
    selected_access.preferred_language, raw_token, new_expires_at;
end;
$$;

create or replace function public.resend_tenant_portal_invitation(target_access_id uuid)
returns table (access_id uuid, invitation_id uuid, invitation_email text, invitation_language text, invitation_token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  selected_access public.tenant_portal_accesses%rowtype;
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  new_invitation_id uuid;
  new_expires_at timestamptz := now() + interval '7 days';
begin
  perform private.expire_tenant_portal_invitations();
  select * into selected_access from public.tenant_portal_accesses where id = target_access_id for update;
  if selected_access.id is null or not (select private.has_capability(selected_access.organization_id, 'tenant_portal.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if selected_access.status = 'active' then raise exception 'access_already_active' using errcode = '22023'; end if;
  update public.tenant_portal_invitations set status = 'revoked', revoked_at = now()
    where access_id = selected_access.id and status = 'pending';
  update public.tenant_portal_accesses set status = 'invited', user_id = null, accepted_at = null,
    revoked_at = null, invited_at = now(), invited_by = (select auth.uid()), updated_at = now()
    where id = selected_access.id returning * into selected_access;
  insert into public.tenant_portal_invitations (
    organization_id, access_id, tenant_id, email, token_hash, invited_by, expires_at
  ) values (
    selected_access.organization_id, selected_access.id, selected_access.tenant_id, selected_access.invited_email,
    encode(extensions.digest(convert_to(raw_token, 'utf8'), 'sha256'), 'hex'), (select auth.uid()), new_expires_at
  ) returning id into new_invitation_id;
  perform private.write_administrative_audit(selected_access.organization_id, 'tenant_portal.invitation_resent',
    null, null, null, jsonb_build_object('tenant_id', selected_access.tenant_id, 'access_id', selected_access.id));
  perform private.log_tenant_portal_access(selected_access.organization_id, selected_access.tenant_id,
    selected_access.id, new_invitation_id, null, 'invitation_sent', 'succeeded', jsonb_build_object('resent', true));
  return query select selected_access.id, new_invitation_id, selected_access.invited_email,
    selected_access.preferred_language, raw_token, new_expires_at;
end;
$$;

create or replace function public.revoke_tenant_portal_access(target_access_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare selected_access public.tenant_portal_accesses%rowtype;
begin
  select * into selected_access from public.tenant_portal_accesses where id = target_access_id for update;
  if selected_access.id is null or not (select private.has_capability(selected_access.organization_id, 'tenant_portal.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.tenant_portal_accesses set status = 'revoked', revoked_at = now(), updated_at = now()
    where id = selected_access.id;
  update public.tenant_portal_sessions set revoked_at = coalesce(revoked_at, now())
    where access_id = selected_access.id and revoked_at is null;
  update public.tenant_portal_invitations set status = 'revoked', revoked_at = now()
    where access_id = selected_access.id and status = 'pending';
  perform private.write_administrative_audit(selected_access.organization_id, 'tenant_portal.revoked',
    selected_access.user_id, null, null, jsonb_build_object('tenant_id', selected_access.tenant_id, 'access_id', selected_access.id));
  perform private.log_tenant_portal_access(selected_access.organization_id, selected_access.tenant_id,
    selected_access.id, null, null, 'access_revoked', 'succeeded');
end;
$$;

create or replace function public.inspect_tenant_portal_invitation(invitation_token text)
returns table (organization_name text, invited_email text, tenant_name text, preferred_language text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare current_email text;
begin
  perform private.expire_tenant_portal_invitations();
  select lower(email) into current_email from auth.users
    where id = (select auth.uid()) and email_confirmed_at is not null;
  if current_email is null then raise exception 'verified_identity_required' using errcode = '42501'; end if;
  perform private.log_tenant_portal_access(i.organization_id, i.tenant_id, i.access_id, i.id, null,
    'invitation_opened', 'succeeded')
  from public.tenant_portal_invitations i
  where i.token_hash = encode(extensions.digest(convert_to(invitation_token, 'utf8'), 'sha256'), 'hex')
    and i.email = current_email and i.status = 'pending' and i.expires_at > now();
  return query select p.name, i.email, t.full_name, a.preferred_language, i.expires_at
    from public.tenant_portal_invitations i
    join public.tenant_portal_accesses a
      on a.organization_id = i.organization_id and a.id = i.access_id and a.tenant_id = i.tenant_id
    join public.organization_profiles p on p.organization_id = i.organization_id
    join public.tenants t on t.organization_id = i.organization_id and t.id = i.tenant_id
    where i.token_hash = encode(extensions.digest(convert_to(invitation_token, 'utf8'), 'sha256'), 'hex')
      and i.email = current_email and i.status = 'pending' and i.expires_at > now();
end;
$$;

create or replace function public.accept_tenant_portal_invitation(invitation_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  selected_invitation public.tenant_portal_invitations%rowtype;
  selected_access public.tenant_portal_accesses%rowtype;
  current_user_id uuid := (select auth.uid());
  current_email text;
  current_auth_session text := (select private.current_portal_auth_session_id());
  new_session_id uuid;
begin
  perform private.expire_tenant_portal_invitations();
  select lower(email) into current_email from auth.users
    where id = current_user_id and email_confirmed_at is not null;
  if current_email is null or current_auth_session is null then
    raise exception 'verified_identity_required' using errcode = '42501';
  end if;
  select * into selected_invitation from public.tenant_portal_invitations
    where token_hash = encode(extensions.digest(convert_to(invitation_token, 'utf8'), 'sha256'), 'hex') for update;
  if selected_invitation.id is null or selected_invitation.email <> current_email then
    raise exception 'invalid_invitation' using errcode = '42501';
  end if;
  if selected_invitation.status = 'expired' then return null; end if;
  if selected_invitation.status <> 'pending' then raise exception 'invitation_already_used' using errcode = '22023'; end if;
  select * into selected_access from public.tenant_portal_accesses where id = selected_invitation.access_id for update;
  if selected_access.id is null or selected_access.status <> 'invited' then
    raise exception 'invalid_invitation' using errcode = '42501';
  end if;
  update public.tenant_portal_accesses set status = 'active', user_id = current_user_id,
    accepted_at = now(), revoked_at = null, last_login_at = now(), updated_at = now()
    where id = selected_access.id;
  update public.tenant_portal_invitations set status = 'accepted', accepted_at = now(), accepted_by = current_user_id
    where id = selected_invitation.id;
  insert into public.tenant_portal_sessions (
    organization_id, access_id, tenant_id, user_id, auth_session_id, expires_at
  ) values (
    selected_access.organization_id, selected_access.id, selected_access.tenant_id,
    current_user_id, current_auth_session, now() + interval '30 days'
  ) on conflict (access_id, auth_session_id) do update set verified_at = now(),
    expires_at = now() + interval '30 days', last_seen_at = now(), revoked_at = null
  returning id into new_session_id;
  perform private.write_administrative_audit(selected_access.organization_id, 'tenant_portal.invitation_accepted',
    current_user_id, null, null, jsonb_build_object('tenant_id', selected_access.tenant_id, 'access_id', selected_access.id));
  perform private.log_tenant_portal_access(selected_access.organization_id, selected_access.tenant_id,
    selected_access.id, selected_invitation.id, new_session_id, 'invitation_accepted', 'succeeded');
  return selected_access.id;
end;
$$;

create or replace function public.start_tenant_portal_session()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  current_auth_session text := (select private.current_portal_auth_session_id());
  selected_access record;
  created_count integer := 0;
  current_session_id uuid;
  previous_session_exists boolean;
  created_new_session boolean;
  expired_session_id uuid;
begin
  if current_user_id is null or current_auth_session is null then
    raise exception 'verified_identity_required' using errcode = '42501';
  end if;
  for selected_access in select * from public.tenant_portal_accesses
    where user_id = current_user_id and status = 'active'
    order by id
  loop
    current_session_id := null;
    created_new_session := false;
    expired_session_id := null;
    select exists (
      select 1 from public.tenant_portal_sessions
      where access_id = selected_access.id and user_id = current_user_id
    ) into previous_session_exists;
    insert into public.tenant_portal_sessions (
      organization_id, access_id, tenant_id, user_id, auth_session_id, expires_at
    ) values (
      selected_access.organization_id, selected_access.id, selected_access.tenant_id,
      current_user_id, current_auth_session, now() + interval '30 days'
    ) on conflict (access_id, auth_session_id) do nothing
    returning id into current_session_id;
    created_new_session := current_session_id is not null;
    if current_session_id is null then
      select id into current_session_id from public.tenant_portal_sessions
        where access_id = selected_access.id and auth_session_id = current_auth_session
          and user_id = current_user_id and revoked_at is null and expires_at > now();
    end if;
    if current_session_id is null then
      select id into expired_session_id from public.tenant_portal_sessions
        where access_id = selected_access.id and auth_session_id = current_auth_session
          and user_id = current_user_id and expires_at <= now()
        limit 1;
      if expired_session_id is not null then
        perform private.log_tenant_portal_access(selected_access.organization_id, selected_access.tenant_id,
          selected_access.id, null, expired_session_id, 'session_expired', 'refused');
        perform private.log_tenant_portal_access(selected_access.organization_id, selected_access.tenant_id,
          selected_access.id, null, expired_session_id, 'login_refused', 'refused');
      end if;
    end if;
    if current_session_id is not null then
      update public.tenant_portal_accesses set last_login_at = now(), updated_at = now() where id = selected_access.id;
      if previous_session_exists and created_new_session then
        perform private.log_tenant_portal_access(selected_access.organization_id, selected_access.tenant_id,
          selected_access.id, null, current_session_id, 'new_device', 'succeeded');
      end if;
      perform private.log_tenant_portal_access(selected_access.organization_id, selected_access.tenant_id,
        selected_access.id, null, current_session_id, 'login_succeeded', 'succeeded');
      created_count := created_count + 1;
    end if;
  end loop;
  return created_count;
end;
$$;

create or replace function public.list_my_tenant_portal_accesses()
returns table (
  access_id uuid, organization_id uuid, organization_name text, tenant_id uuid,
  tenant_name text, preferred_language text, last_login_at timestamptz, lease_count bigint
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.organization_id, p.name, a.tenant_id, t.full_name,
    a.preferred_language, a.last_login_at, count(la.lease_id)
  from public.tenant_portal_accesses a
  join public.organization_profiles p on p.organization_id = a.organization_id
  join public.tenants t on t.organization_id = a.organization_id and t.id = a.tenant_id
  join public.tenant_portal_lease_accesses la
    on la.organization_id = a.organization_id and la.access_id = a.id and la.tenant_id = a.tenant_id
  where a.user_id = (select auth.uid()) and a.status = 'active'
    and (select private.has_active_tenant_portal_access(a.id))
  group by a.id, p.name, t.full_name;
$$;

create or replace function public.has_tenant_portal_identity()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tenant_portal_accesses
    where user_id = (select auth.uid()) and status = 'active'
  );
$$;

create or replace function public.get_tenant_portal_home(target_access_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not (select private.has_active_tenant_portal_access(target_access_id)) then
    raise exception 'not_found' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'accessId', a.id, 'organizationId', a.organization_id, 'organizationName', op.name,
    'currencyCode', op.currency_code, 'tenantId', a.tenant_id, 'tenantName', t.full_name,
    'email', t.email, 'phone', t.phone, 'preferredLanguage', a.preferred_language,
    'availableCreditXaf', coalesce(fp.available_credit_xaf, 0),
    'amountDueXaf', coalesce(fp.amount_due_xaf, 0),
    'leases', coalesce((select jsonb_agg(jsonb_build_object(
      'id', l.id, 'status', l.status, 'startDate', l.start_date, 'endDate', l.end_date,
      'endedOn', l.ended_on, 'baseRentXaf', l.base_rent_xaf,
      'recurringChargesXaf', l.recurring_charges_xaf, 'periodicTotalXaf', l.periodic_total_xaf,
      'securityDepositXaf', l.security_deposit_xaf, 'billingFrequency', l.billing_frequency,
      'dueDay', l.due_day, 'propertyName', pr.name, 'propertyLocality', pr.locality,
      'unitLabel', u.label, 'unitType', u.type,
      'nextDue', (select jsonb_build_object(
        'id', d.id, 'kind', d.kind, 'dueDate', d.due_date, 'periodStart', d.period_start,
        'periodEnd', d.period_end, 'totalXaf', d.net_expected_amount_xaf,
        'creditAppliedXaf', d.covered_by_credit_xaf, 'paymentsReceivedXaf', d.payment_allocated_xaf,
        'remainingXaf', d.remaining_amount_xaf, 'status', d.derived_status
      ) from public.dues_with_status d where d.organization_id = l.organization_id and d.lease_id = l.id
        and d.cancelled_at is null and d.kind in ('periodic', 'initial_prorata')
        and d.remaining_amount_xaf > 0 order by d.due_date, d.period_start limit 1)
    ) order by case when l.status = 'active' then 0 else 1 end, l.start_date desc)
      from public.tenant_portal_lease_accesses la
      join public.leases l on l.organization_id = la.organization_id and l.id = la.lease_id and l.tenant_id = la.tenant_id
      join public.properties pr on pr.organization_id = l.organization_id and pr.id = l.property_id
      join public.units u on u.organization_id = l.organization_id and u.id = l.unit_id and u.property_id = l.property_id
      where la.access_id = a.id and l.status in ('active', 'ended')), '[]'::jsonb)
  ) into result
  from public.tenant_portal_accesses a
  join public.organization_profiles op on op.organization_id = a.organization_id
  join public.tenants t on t.organization_id = a.organization_id and t.id = a.tenant_id
  left join public.tenant_financial_positions fp on fp.organization_id = a.organization_id and fp.tenant_id = a.tenant_id
  where a.id = target_access_id;
  return result;
end;
$$;

create or replace function public.list_tenant_portal_dues(target_access_id uuid, target_lease_id uuid, result_limit integer default 50)
returns table (
  due_id uuid, kind text, reference text, period_start date, period_end date, due_date date,
  rent_xaf bigint, charges_xaf bigint, deposit_xaf bigint, total_xaf bigint,
  credit_applied_xaf bigint, payments_received_xaf bigint, remaining_xaf bigint, status text
)
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.has_tenant_portal_lease_access(target_access_id, target_lease_id)) then
    raise exception 'not_found' using errcode = '42501';
  end if;
  return query select d.id, d.kind, d.reference, d.period_start, d.period_end, d.due_date,
    d.rent_amount_xaf, d.recurring_charges_amount_xaf, d.deposit_amount_xaf,
    d.net_expected_amount_xaf, d.covered_by_credit_xaf, d.payment_allocated_xaf,
    d.remaining_amount_xaf, d.derived_status
  from public.dues_with_status d
  where d.lease_id = target_lease_id and d.cancelled_at is null and d.kind <> 'adjustment'
  order by d.due_date desc, d.period_start desc limit greatest(1, least(coalesce(result_limit, 50), 100));
end;
$$;

create or replace function public.list_tenant_portal_payments(target_access_id uuid, target_lease_id uuid, result_limit integer default 50)
returns table (
  payment_id uuid, reference text, amount_xaf bigint, payment_date date, method text, status text,
  external_reference text, allocations jsonb
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.has_tenant_portal_lease_access(target_access_id, target_lease_id)) then
    raise exception 'not_found' using errcode = '42501';
  end if;
  return query select p.id, p.reference, p.amount_xaf, p.payment_date, p.method, p.status, p.external_reference,
    coalesce((select jsonb_agg(jsonb_build_object(
      'dueId', pa.due_id, 'amountXaf', pa.amount_xaf, 'rentXaf', pa.rent_amount_xaf,
      'chargesXaf', pa.recurring_charges_amount_xaf, 'depositXaf', pa.deposit_amount_xaf
    ) order by pa.created_at) from public.payment_allocations pa
      where pa.organization_id = p.organization_id and pa.payment_id = p.id), '[]'::jsonb)
  from public.payments p
  where p.lease_id = target_lease_id and p.status in ('confirmed', 'reversed')
  order by p.payment_date desc, p.created_at desc limit greatest(1, least(coalesce(result_limit, 50), 100));
end;
$$;

create or replace function public.list_tenant_portal_documents(target_access_id uuid, target_lease_id uuid, result_limit integer default 50)
returns table (
  document_id uuid, document_type text, reference text, status text, issued_on date,
  period_start date, period_end date, viewed boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.has_tenant_portal_lease_access(target_access_id, target_lease_id)) then
    raise exception 'not_found' using errcode = '42501';
  end if;
  return query select d.id, d.document_type, d.reference, d.status, d.issued_on,
    d.period_start, d.period_end, (v.document_id is not null)
  from public.financial_documents d
  left join public.tenant_portal_document_views v
    on v.organization_id = d.organization_id and v.access_id = target_access_id and v.document_id = d.id
  where d.lease_id = target_lease_id and d.document_type in ('due_notice', 'payment_receipt', 'rent_receipt')
  order by d.issued_on desc, d.created_at desc limit greatest(1, least(coalesce(result_limit, 50), 100));
end;
$$;

create or replace function public.get_tenant_portal_document(target_access_id uuid, target_document_id uuid)
returns table (
  document_id uuid, organization_id uuid, tenant_id uuid, lease_id uuid, due_id uuid, payment_id uuid,
  document_type text, reference text, status text, language text, issued_on date,
  period_start date, period_end date, snapshot jsonb, template_version text, storage_path text,
  created_by uuid, created_at timestamptz, invalidated_at timestamptz, invalidation_reason text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.has_active_tenant_portal_access(target_access_id)) then
    raise exception 'not_found' using errcode = '42501';
  end if;
  return query select d.id, d.organization_id, d.tenant_id, d.lease_id, d.due_id, d.payment_id,
    d.document_type, d.reference, d.status, d.language, d.issued_on, d.period_start, d.period_end,
    d.snapshot, d.template_version, d.storage_path, d.created_by, d.created_at,
    d.invalidated_at, d.invalidation_reason
  from public.financial_documents d
  join public.tenant_portal_accesses a
    on a.id = target_access_id and a.organization_id = d.organization_id and a.tenant_id = d.tenant_id
  join public.tenant_portal_lease_accesses la
    on la.organization_id = d.organization_id and la.access_id = a.id and la.tenant_id = a.tenant_id
      and la.lease_id = d.lease_id
  where d.id = target_document_id and d.document_type in ('due_notice', 'payment_receipt', 'rent_receipt');
end;
$$;

create or replace function public.mark_tenant_portal_document_viewed(target_access_id uuid, target_document_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare selected_document record; selected_access public.tenant_portal_accesses%rowtype;
begin
  select * into selected_document from public.get_tenant_portal_document(target_access_id, target_document_id);
  if selected_document.document_id is null or selected_document.document_type not in ('payment_receipt', 'rent_receipt') then
    raise exception 'not_found' using errcode = '42501';
  end if;
  select * into selected_access from public.tenant_portal_accesses where id = target_access_id;
  insert into public.tenant_portal_document_views (organization_id, access_id, tenant_id, document_id)
    values (selected_access.organization_id, selected_access.id, selected_access.tenant_id, target_document_id)
  on conflict (organization_id, access_id, document_id) do update set last_viewed_at = now();
end;
$$;

create or replace function public.get_tenant_portal_access_status(target_tenant_id uuid)
returns table (
  access_id uuid, status text, invited_email text, invited_at timestamptz, accepted_at timestamptz,
  revoked_at timestamptz, last_login_at timestamptz, invitation_id uuid, invitation_status text,
  invitation_expires_at timestamptz, lease_ids uuid[]
)
language plpgsql security definer set search_path = '' as $$
declare target_organization_id uuid;
begin
  perform private.expire_tenant_portal_invitations();
  select organization_id into target_organization_id from public.tenants where id = target_tenant_id;
  if target_organization_id is null or not (select private.has_capability(target_organization_id, 'tenant_portal.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query select a.id, a.status, a.invited_email, a.invited_at, a.accepted_at,
    a.revoked_at, a.last_login_at, i.id, i.status, i.expires_at,
    coalesce((select array_agg(la.lease_id order by la.granted_at)
      from public.tenant_portal_lease_accesses la where la.access_id = a.id), '{}'::uuid[])
  from public.tenant_portal_accesses a
  left join lateral (
    select pi.* from public.tenant_portal_invitations pi where pi.access_id = a.id
    order by pi.created_at desc limit 1
  ) i on true
  where a.organization_id = target_organization_id and a.tenant_id = target_tenant_id;
end;
$$;

create or replace function private.can_portal_read_financial_document_path(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.financial_documents d
    join public.tenant_portal_accesses a on a.organization_id = d.organization_id and a.tenant_id = d.tenant_id
    join public.tenant_portal_lease_accesses la
      on la.organization_id = d.organization_id and la.access_id = a.id and la.tenant_id = a.tenant_id
        and la.lease_id = d.lease_id
    where d.organization_id::text = (storage.foldername(object_name))[1]
      and d.id::text = (storage.foldername(object_name))[2]
      and object_name = d.organization_id::text || '/' || d.id::text || '/v1.pdf'
      and d.document_type in ('due_notice', 'payment_receipt', 'rent_receipt')
      and (select private.has_active_tenant_portal_access(a.id))
  );
$$;

drop policy if exists "authorized members read private financial documents" on storage.objects;
create policy "authorized users read private financial documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'financial-documents'
  and ((select private.can_access_financial_document_path(name))
    or (select private.can_portal_read_financial_document_path(name)))
);

revoke all on public.tenant_portal_accesses, public.tenant_portal_lease_accesses,
  public.tenant_portal_invitations, public.tenant_portal_sessions,
  public.tenant_portal_document_views from public, anon, authenticated;
revoke all on private.tenant_portal_access_log from public, anon, authenticated;

revoke all on function private.current_portal_auth_session_id() from public, anon, authenticated;
revoke all on function private.log_tenant_portal_access(uuid, uuid, uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.expire_tenant_portal_invitations() from public, anon, authenticated;
revoke all on function private.has_active_tenant_portal_access(uuid) from public, anon, authenticated;
revoke all on function private.has_tenant_portal_lease_access(uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_portal_read_financial_document_path(text) from public, anon;
grant execute on function private.can_portal_read_financial_document_path(text) to authenticated;

revoke all on function public.create_tenant_portal_invitation(uuid, uuid[]) from public, anon;
revoke all on function public.resend_tenant_portal_invitation(uuid) from public, anon;
revoke all on function public.revoke_tenant_portal_access(uuid) from public, anon;
revoke all on function public.inspect_tenant_portal_invitation(text) from public, anon;
revoke all on function public.accept_tenant_portal_invitation(text) from public, anon;
revoke all on function public.start_tenant_portal_session() from public, anon;
revoke all on function public.list_my_tenant_portal_accesses() from public, anon;
revoke all on function public.has_tenant_portal_identity() from public, anon;
revoke all on function public.get_tenant_portal_home(uuid) from public, anon;
revoke all on function public.list_tenant_portal_dues(uuid, uuid, integer) from public, anon;
revoke all on function public.list_tenant_portal_payments(uuid, uuid, integer) from public, anon;
revoke all on function public.list_tenant_portal_documents(uuid, uuid, integer) from public, anon;
revoke all on function public.get_tenant_portal_document(uuid, uuid) from public, anon;
revoke all on function public.mark_tenant_portal_document_viewed(uuid, uuid) from public, anon;
revoke all on function public.get_tenant_portal_access_status(uuid) from public, anon;

grant execute on function public.create_tenant_portal_invitation(uuid, uuid[]) to authenticated;
grant execute on function public.resend_tenant_portal_invitation(uuid) to authenticated;
grant execute on function public.revoke_tenant_portal_access(uuid) to authenticated;
grant execute on function public.inspect_tenant_portal_invitation(text) to authenticated;
grant execute on function public.accept_tenant_portal_invitation(text) to authenticated;
grant execute on function public.start_tenant_portal_session() to authenticated;
grant execute on function public.list_my_tenant_portal_accesses() to authenticated;
grant execute on function public.has_tenant_portal_identity() to authenticated;
grant execute on function public.get_tenant_portal_home(uuid) to authenticated;
grant execute on function public.list_tenant_portal_dues(uuid, uuid, integer) to authenticated;
grant execute on function public.list_tenant_portal_payments(uuid, uuid, integer) to authenticated;
grant execute on function public.list_tenant_portal_documents(uuid, uuid, integer) to authenticated;
grant execute on function public.get_tenant_portal_document(uuid, uuid) to authenticated;
grant execute on function public.mark_tenant_portal_document_viewed(uuid, uuid) to authenticated;
grant execute on function public.get_tenant_portal_access_status(uuid) to authenticated;

comment on table public.tenant_portal_accesses is
  'Lot 6E: external tenant authorization, distinct from internal Membership and tied to one Organization and Tenant.';
comment on table public.tenant_portal_sessions is
  'Lot 6E: portal authorization session capped at 30 days and rechecked on every portal RPC.';
comment on table private.tenant_portal_access_log is
  'Lot 6E: minimized security access log retained for 12 months; not an internal business Activity feed.';
