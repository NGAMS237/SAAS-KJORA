-- Lot 6E corrective migration: qualify output-column names inside invitation RPCs.

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
  select t.* into selected_tenant from public.tenants t where t.id = target_tenant_id for update;
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

  select a.* into selected_access from public.tenant_portal_accesses a
    where a.organization_id = selected_tenant.organization_id and a.tenant_id = selected_tenant.id for update;
  was_revoked := selected_access.id is not null and selected_access.status = 'revoked';
  if selected_access.id is null then
    insert into public.tenant_portal_accesses as a (
      organization_id, tenant_id, invited_email, preferred_language, invited_by
    ) values (
      selected_tenant.organization_id, selected_tenant.id, normalized_email,
      coalesce(selected_tenant.preferred_language,
        (select op.language from public.organization_profiles op where op.organization_id = selected_tenant.organization_id), 'fr'),
      (select auth.uid())
    ) returning a.* into selected_access;
  elsif selected_access.status = 'active' then
    raise exception 'access_already_active' using errcode = '22023';
  else
    update public.tenant_portal_accesses as a set status = 'invited', user_id = null,
      invited_email = normalized_email, preferred_language = coalesce(selected_tenant.preferred_language,
        (select op.language from public.organization_profiles op where op.organization_id = selected_tenant.organization_id), 'fr'),
      invited_by = (select auth.uid()), invited_at = now(), accepted_at = null, revoked_at = null, updated_at = now()
    where a.id = selected_access.id returning a.* into selected_access;
  end if;

  delete from public.tenant_portal_lease_accesses as la where la.access_id = selected_access.id;
  insert into public.tenant_portal_lease_accesses (organization_id, access_id, tenant_id, lease_id, granted_by)
    select selected_tenant.organization_id, selected_access.id, selected_tenant.id, requested.value, (select auth.uid())
    from (select distinct unnest(target_lease_ids) as value) requested;
  update public.tenant_portal_invitations as i set status = 'revoked', revoked_at = now()
    where i.access_id = selected_access.id and i.status = 'pending';
  insert into public.tenant_portal_invitations as i (
    organization_id, access_id, tenant_id, email, token_hash, invited_by, expires_at
  ) values (
    selected_tenant.organization_id, selected_access.id, selected_tenant.id, normalized_email,
    encode(extensions.digest(convert_to(raw_token, 'utf8'), 'sha256'), 'hex'), (select auth.uid()), new_expires_at
  ) returning i.id into new_invitation_id;
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
  select a.* into selected_access from public.tenant_portal_accesses a where a.id = target_access_id for update;
  if selected_access.id is null or not (select private.has_capability(selected_access.organization_id, 'tenant_portal.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if selected_access.status = 'active' then raise exception 'access_already_active' using errcode = '22023'; end if;
  update public.tenant_portal_invitations as i set status = 'revoked', revoked_at = now()
    where i.access_id = selected_access.id and i.status = 'pending';
  update public.tenant_portal_accesses as a set status = 'invited', user_id = null, accepted_at = null,
    revoked_at = null, invited_at = now(), invited_by = (select auth.uid()), updated_at = now()
    where a.id = selected_access.id returning a.* into selected_access;
  insert into public.tenant_portal_invitations as i (
    organization_id, access_id, tenant_id, email, token_hash, invited_by, expires_at
  ) values (
    selected_access.organization_id, selected_access.id, selected_access.tenant_id, selected_access.invited_email,
    encode(extensions.digest(convert_to(raw_token, 'utf8'), 'sha256'), 'hex'), (select auth.uid()), new_expires_at
  ) returning i.id into new_invitation_id;
  perform private.write_administrative_audit(selected_access.organization_id, 'tenant_portal.invitation_resent',
    null, null, null, jsonb_build_object('tenant_id', selected_access.tenant_id, 'access_id', selected_access.id));
  perform private.log_tenant_portal_access(selected_access.organization_id, selected_access.tenant_id,
    selected_access.id, new_invitation_id, null, 'invitation_sent', 'succeeded', jsonb_build_object('resent', true));
  return query select selected_access.id, new_invitation_id, selected_access.invited_email,
    selected_access.preferred_language, raw_token, new_expires_at;
end;
$$;

revoke all on function public.create_tenant_portal_invitation(uuid, uuid[]) from public, anon;
revoke all on function public.resend_tenant_portal_invitation(uuid) from public, anon;
grant execute on function public.create_tenant_portal_invitation(uuid, uuid[]) to authenticated;
grant execute on function public.resend_tenant_portal_invitation(uuid) to authenticated;
