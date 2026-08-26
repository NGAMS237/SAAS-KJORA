-- Lot 5C hardening: every ownership change must use the dedicated atomic transfer.

alter table public.membership_invitations
  add constraint membership_invitations_owner_transfer_only
  check (role <> 'organization_owner');

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
  if new_role not in ('manager', 'collector', 'caretaker', 'accountant', 'viewer') then
    raise exception 'owner_transfer_required' using errcode = '22023';
  end if;
  perform 1 from public.organizations where id = target_organization_id for update;
  select * into membership from public.memberships
    where id = target_membership_id and organization_id = target_organization_id and status = 'active'
    for update;
  if membership.id is null then raise exception 'membership_not_found' using errcode = '22023'; end if;
  if membership.role = 'organization_owner' then
    raise exception 'owner_transfer_required' using errcode = '22023';
  end if;
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
  if membership.user_id = (select auth.uid()) then
    raise exception 'self_revocation_forbidden' using errcode = '22023';
  end if;
  if membership.role = 'organization_owner' then
    raise exception 'owner_transfer_required' using errcode = '22023';
  end if;
  update public.memberships set status = 'revoked', revoked_at = now() where id = membership.id;
  perform private.write_administrative_audit(
    target_organization_id, 'member.revoked', membership.user_id, membership.id, null,
    jsonb_build_object('role', membership.role)
  );
end;
$$;
