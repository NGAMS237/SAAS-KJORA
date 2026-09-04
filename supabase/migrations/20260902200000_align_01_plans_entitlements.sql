-- =============================================================================
-- ALIGN-01 — Plans, Quotas & Entitlements
-- Migration: 20260902200000_align_01_plans_entitlements
-- Scope: plan catalog, quota enforcement, feature gating
-- No billing, no providers, no subscription lifecycle
-- Existing organizations: backfill désactivé (ALIGN-01 gate correctif 2026-09-02).
--   Aucune Organization existante n'est automatiquement assignée.
--   Blaise valide les plans cibles et autorise explicitement le backfill
--   via private.assign_organization_plan() avant toute migration Production.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Plan catalog
-- ---------------------------------------------------------------------------

create table public.organization_plans (
  organization_id uuid primary key
    references public.organizations (id) on delete cascade,
  plan text not null default 'decouverte'
    check (plan in ('decouverte', 'essentiel', 'avance', 'patrimoine', 'sur_mesure')),
  -- sur_mesure overrides (null = use plan default for that plan)
  custom_max_properties      int  check (custom_max_properties is null or custom_max_properties > 0),
  custom_max_active_units    int  check (custom_max_active_units is null or custom_max_active_units > 0),
  custom_max_collaborators   int  check (custom_max_collaborators is null or custom_max_collaborators >= 0),
  custom_max_organizations   int  check (custom_max_organizations is null or custom_max_organizations > 0),
  assigned_at  timestamptz not null default now(),
  assigned_by  uuid references auth.users (id)
);

alter table public.organization_plans enable row level security;

-- Only active members of the organization may read their plan
create policy "organization_plans_select"
  on public.organization_plans for select
  using (private.is_active_member(organization_id));

-- No direct insert/update from clients
create policy "organization_plans_no_client_write"
  on public.organization_plans for all
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- 2. Feature catalog
-- ---------------------------------------------------------------------------

create table public.plan_features (
  plan     text not null check (plan in ('decouverte', 'essentiel', 'avance', 'patrimoine', 'sur_mesure')),
  feature  text not null,
  primary key (plan, feature)
);

alter table public.plan_features enable row level security;

-- Read-only for all authenticated users (feature catalog is not sensitive)
create policy "plan_features_select"
  on public.plan_features for select
  to authenticated
  using (true);

create policy "plan_features_no_client_write"
  on public.plan_features for all
  using (false)
  with check (false);

-- Seed feature flags
-- Core (all plans including decouverte)
insert into public.plan_features (plan, feature) values
  -- decouverte
  ('decouverte', 'properties'),
  ('decouverte', 'units'),
  ('decouverte', 'tenants'),
  ('decouverte', 'leases'),
  ('decouverte', 'dues'),
  ('decouverte', 'payments_manual'),
  ('decouverte', 'receipts'),
  ('decouverte', 'tenant_portal'),
  ('decouverte', 'notifications_basic'),
  ('decouverte', 'documents_essential'),
  -- essentiel (additive)
  ('essentiel', 'properties'),
  ('essentiel', 'units'),
  ('essentiel', 'tenants'),
  ('essentiel', 'leases'),
  ('essentiel', 'dues'),
  ('essentiel', 'payments_manual'),
  ('essentiel', 'receipts'),
  ('essentiel', 'tenant_portal'),
  ('essentiel', 'notifications_basic'),
  ('essentiel', 'documents_essential'),
  ('essentiel', 'contracts'),
  ('essentiel', 'contract_templates_system'),
  ('essentiel', 'collaborators'),
  ('essentiel', 'exports_standard'),
  -- avance (additive)
  ('avance', 'properties'),
  ('avance', 'units'),
  ('avance', 'tenants'),
  ('avance', 'leases'),
  ('avance', 'dues'),
  ('avance', 'payments_manual'),
  ('avance', 'receipts'),
  ('avance', 'tenant_portal'),
  ('avance', 'notifications_basic'),
  ('avance', 'documents_essential'),
  ('avance', 'contracts'),
  ('avance', 'contract_templates_system'),
  ('avance', 'collaborators'),
  ('avance', 'exports_standard'),
  ('avance', 'contract_templates_custom'),
  ('avance', 'audit_advanced'),
  ('avance', 'automation_advanced'),
  ('avance', 'exports_advanced'),
  ('avance', 'reminders_custom'),
  ('avance', 'multi_organization'),
  -- patrimoine (additive)
  ('patrimoine', 'properties'),
  ('patrimoine', 'units'),
  ('patrimoine', 'tenants'),
  ('patrimoine', 'leases'),
  ('patrimoine', 'dues'),
  ('patrimoine', 'payments_manual'),
  ('patrimoine', 'receipts'),
  ('patrimoine', 'tenant_portal'),
  ('patrimoine', 'notifications_basic'),
  ('patrimoine', 'documents_essential'),
  ('patrimoine', 'contracts'),
  ('patrimoine', 'contract_templates_system'),
  ('patrimoine', 'collaborators'),
  ('patrimoine', 'exports_standard'),
  ('patrimoine', 'contract_templates_custom'),
  ('patrimoine', 'audit_advanced'),
  ('patrimoine', 'automation_advanced'),
  ('patrimoine', 'exports_advanced'),
  ('patrimoine', 'reminders_custom'),
  ('patrimoine', 'multi_organization'),
  ('patrimoine', 'reporting_consolidated'),
  -- sur_mesure (all current features + reserved future)
  ('sur_mesure', 'properties'),
  ('sur_mesure', 'units'),
  ('sur_mesure', 'tenants'),
  ('sur_mesure', 'leases'),
  ('sur_mesure', 'dues'),
  ('sur_mesure', 'payments_manual'),
  ('sur_mesure', 'receipts'),
  ('sur_mesure', 'tenant_portal'),
  ('sur_mesure', 'notifications_basic'),
  ('sur_mesure', 'documents_essential'),
  ('sur_mesure', 'contracts'),
  ('sur_mesure', 'contract_templates_system'),
  ('sur_mesure', 'collaborators'),
  ('sur_mesure', 'exports_standard'),
  ('sur_mesure', 'contract_templates_custom'),
  ('sur_mesure', 'audit_advanced'),
  ('sur_mesure', 'automation_advanced'),
  ('sur_mesure', 'exports_advanced'),
  ('sur_mesure', 'reminders_custom'),
  ('sur_mesure', 'multi_organization'),
  ('sur_mesure', 'reporting_consolidated'),
  ('sur_mesure', 'api_access'),
  ('sur_mesure', 'webhooks'),
  ('sur_mesure', 'sso'),
  ('sur_mesure', 'white_label');

-- ---------------------------------------------------------------------------
-- 3. Quota limit function
-- ---------------------------------------------------------------------------

-- Returns (max_properties, max_active_units, max_collaborators, max_organizations)
-- null means unlimited (sur_mesure with no custom override)
create or replace function private.plan_quota_limits(
  p_plan text,
  p_custom_max_properties    int default null,
  p_custom_max_active_units  int default null,
  p_custom_max_collaborators int default null,
  p_custom_max_organizations int default null
)
returns table (
  max_properties    int,
  max_active_units  int,
  max_collaborators int,
  max_organizations int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_plan = 'decouverte' then
    return query select 1, 3, 0, 1;
  elsif p_plan = 'essentiel' then
    return query select 3, 10, 1, 1;
  elsif p_plan = 'avance' then
    return query select 10, 30, 3, 2;
  elsif p_plan = 'patrimoine' then
    return query select 30, 100, 10, 5;
  elsif p_plan = 'sur_mesure' then
    return query select
      p_custom_max_properties,
      p_custom_max_active_units,
      p_custom_max_collaborators,
      p_custom_max_organizations;
  else
    -- Unknown plan: apply decouverte limits as safe fallback
    return query select 1, 3, 0, 1;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Internal helpers
-- ---------------------------------------------------------------------------

-- Resolve effective plan row for an organization (never fails: returns decouverte if missing)
create or replace function private.get_org_plan(p_organization_id uuid)
returns public.organization_plans
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select op from public.organization_plans op where op.organization_id = p_organization_id),
    row(p_organization_id, 'decouverte', null, null, null, null, now(), null)::public.organization_plans
  );
$$;

-- Check if a feature is available for an organization's plan
create or replace function private.check_plan_feature(
  p_organization_id uuid,
  p_feature text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plan_features pf
    join (select plan from private.get_org_plan(p_organization_id)) op on op.plan = pf.plan
    where pf.feature = p_feature
  );
$$;

-- Public version callable by authenticated users for their own org
create or replace function public.org_has_feature(
  p_organization_id uuid,
  p_feature text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when private.is_active_member(p_organization_id)
      then private.check_plan_feature(p_organization_id, p_feature)
      else false
    end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Property quota enforcement
-- ---------------------------------------------------------------------------

create or replace function private.enforce_property_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  op    public.organization_plans;
  lim   record;
  usage int;
begin
  -- Only enforce on INSERT or when restoring archived → active
  if tg_op = 'UPDATE' and (old.status = new.status or new.status <> 'active') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    -- archiving: no limit check needed
    return new;
  end if;

  op := private.get_org_plan(new.organization_id);
  select * into lim from private.plan_quota_limits(
    op.plan,
    op.custom_max_properties,
    op.custom_max_active_units,
    op.custom_max_collaborators,
    op.custom_max_organizations
  );

  -- null max = unlimited
  if lim.max_properties is null then return new; end if;

  select count(*) into usage
    from public.properties
    where organization_id = new.organization_id
      and status = 'active'
      and id <> new.id; -- exclude self on UPDATE

  if usage >= lim.max_properties then
    raise exception 'PLAN_PROPERTY_LIMIT_REACHED'
      using errcode = 'P0001',
            detail = jsonb_build_object(
              'plan',    op.plan,
              'quota',   lim.max_properties,
              'current', usage
            )::text;
  end if;

  return new;
end;
$$;

create trigger enforce_property_quota_insert
  before insert on public.properties
  for each row execute function private.enforce_property_quota();

create trigger enforce_property_quota_update
  before update of status on public.properties
  for each row execute function private.enforce_property_quota();

-- ---------------------------------------------------------------------------
-- 6. Active unit quota enforcement
-- ---------------------------------------------------------------------------

create or replace function private.enforce_active_unit_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  op    public.organization_plans;
  lim   record;
  usage int;
begin
  -- Only check when a unit becomes active
  if tg_op = 'UPDATE' and (old.status = new.status or new.status <> 'active') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new; -- archiving, no quota check
  end if;

  op := private.get_org_plan(new.organization_id);
  select * into lim from private.plan_quota_limits(
    op.plan,
    op.custom_max_properties,
    op.custom_max_active_units,
    op.custom_max_collaborators,
    op.custom_max_organizations
  );

  if lim.max_active_units is null then return new; end if;

  select count(*) into usage
    from public.units
    where organization_id = new.organization_id
      and status = 'active'
      and id <> new.id;

  if usage >= lim.max_active_units then
    raise exception 'PLAN_ACTIVE_UNIT_LIMIT_REACHED'
      using errcode = 'P0001',
            detail = jsonb_build_object(
              'plan',    op.plan,
              'quota',   lim.max_active_units,
              'current', usage
            )::text;
  end if;

  return new;
end;
$$;

create trigger enforce_active_unit_quota_insert
  before insert on public.units
  for each row execute function private.enforce_active_unit_quota();

create trigger enforce_active_unit_quota_update
  before update of status on public.units
  for each row execute function private.enforce_active_unit_quota();

-- ---------------------------------------------------------------------------
-- 7. Collaborator quota (called explicitly from RPCs)
-- ---------------------------------------------------------------------------

-- Returns collaborator count (active non-owner members)
create or replace function private.count_collaborators(p_organization_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from public.memberships
    where organization_id = p_organization_id
      and status = 'active'
      and role <> 'organization_owner';
$$;

-- Raises if adding one more collaborator would exceed quota
create or replace function private.assert_collaborator_quota(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  op    public.organization_plans;
  lim   record;
  usage int;
begin
  op := private.get_org_plan(p_organization_id);
  select * into lim from private.plan_quota_limits(
    op.plan,
    op.custom_max_properties,
    op.custom_max_active_units,
    op.custom_max_collaborators,
    op.custom_max_organizations
  );

  if lim.max_collaborators is null then return; end if;

  usage := private.count_collaborators(p_organization_id);

  if usage >= lim.max_collaborators then
    raise exception 'PLAN_COLLABORATOR_LIMIT_REACHED'
      using errcode = 'P0001',
            detail = jsonb_build_object(
              'plan',    op.plan,
              'quota',   lim.max_collaborators,
              'current', usage
            )::text;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Organization quota (per user/owner)
-- ---------------------------------------------------------------------------

create or replace function private.assert_organization_quota(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Look up plan from one of the user's owned orgs to determine their entitlement
  -- For organization quota, we use the MAXIMUM allowed across any plan the user holds.
  -- In practice: a user creating a new org brings their current plan along.
  -- Here we count how many orgs they own and compare to limits.
  -- We use the plan of their CURRENT active org (most recent) as the reference.
  ref_org_id uuid;
  op    public.organization_plans;
  lim   record;
  usage int;
begin
  -- Count orgs where user is owner
  select count(*)::int into usage
    from public.memberships
    where user_id = p_user_id
      and role = 'organization_owner'
      and status = 'active';

  -- Get ref plan from their most recent org
  select m.organization_id into ref_org_id
    from public.memberships m
    where m.user_id = p_user_id
      and m.role = 'organization_owner'
      and m.status = 'active'
    order by m.created_at desc
    limit 1;

  if ref_org_id is null then
    -- First org — always allowed
    return;
  end if;

  op := private.get_org_plan(ref_org_id);
  select * into lim from private.plan_quota_limits(
    op.plan,
    op.custom_max_properties,
    op.custom_max_active_units,
    op.custom_max_collaborators,
    op.custom_max_organizations
  );

  if lim.max_organizations is null then return; end if;

  if usage >= lim.max_organizations then
    raise exception 'PLAN_ORGANIZATION_LIMIT_REACHED'
      using errcode = 'P0001',
            detail = jsonb_build_object(
              'plan',    op.plan,
              'quota',   lim.max_organizations,
              'current', usage
            )::text;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Redeclare create_membership_invitation with collaborator quota check
-- ---------------------------------------------------------------------------

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
  -- Collaborator quota: owners are not counted, non-owner roles are
  if invited_role <> 'organization_owner' then
    perform private.assert_collaborator_quota(target_organization_id);
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

-- ---------------------------------------------------------------------------
-- 10. Redeclare accept_membership_invitation with collaborator quota check
-- ---------------------------------------------------------------------------

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
  -- Re-check collaborator quota at acceptance time (plan may have changed)
  if invitation.role <> 'organization_owner' then
    perform private.assert_collaborator_quota(invitation.organization_id);
  end if;
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

-- ---------------------------------------------------------------------------
-- 11. Public entitlements read function
-- ---------------------------------------------------------------------------

create or replace function public.get_organization_entitlements(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  op         public.organization_plans;
  lim        record;
  prop_usage int;
  unit_usage int;
  coll_usage int;
  features   jsonb;
begin
  if not (select private.is_active_member(p_organization_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  op := private.get_org_plan(p_organization_id);

  select * into lim from private.plan_quota_limits(
    op.plan,
    op.custom_max_properties,
    op.custom_max_active_units,
    op.custom_max_collaborators,
    op.custom_max_organizations
  );

  select count(*)::int into prop_usage
    from public.properties
    where organization_id = p_organization_id and status = 'active';

  select count(*)::int into unit_usage
    from public.units
    where organization_id = p_organization_id and status = 'active';

  select count(*)::int into coll_usage
    from public.memberships
    where organization_id = p_organization_id
      and status = 'active'
      and role <> 'organization_owner';

  select jsonb_agg(pf.feature) into features
    from public.plan_features pf
    where pf.plan = op.plan;

  return jsonb_build_object(
    'plan', op.plan,
    'quotas', jsonb_build_object(
      'max_properties',    lim.max_properties,
      'max_active_units',  lim.max_active_units,
      'max_collaborators', lim.max_collaborators,
      'max_organizations', lim.max_organizations
    ),
    'usage', jsonb_build_object(
      'active_properties', prop_usage,
      'active_units',      unit_usage,
      'collaborators',     coll_usage
    ),
    'features', coalesce(features, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_organization_entitlements(uuid) from public, anon;
grant execute on function public.get_organization_entitlements(uuid) to authenticated;

revoke all on function public.org_has_feature(uuid, text) from public, anon;
grant execute on function public.org_has_feature(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Auto-assign plan on new organization
-- ---------------------------------------------------------------------------

create or replace function private.auto_assign_decouverte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_plans (organization_id, plan, assigned_by)
    values (new.id, 'decouverte', new.created_by)
    on conflict (organization_id) do nothing;
  return new;
end;
$$;

create trigger organizations_auto_plan
  after insert on public.organizations
  for each row execute function private.auto_assign_decouverte();

-- ---------------------------------------------------------------------------
-- 13. Admin-only plan assignment RPC (no client path exposed)
-- ---------------------------------------------------------------------------

create or replace function private.assign_organization_plan(
  p_organization_id uuid,
  p_plan            text,
  p_custom_max_properties    int default null,
  p_custom_max_active_units  int default null,
  p_custom_max_collaborators int default null,
  p_custom_max_organizations int default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_plan not in ('decouverte', 'essentiel', 'avance', 'patrimoine', 'sur_mesure') then
    raise exception 'invalid_plan' using errcode = '22023';
  end if;
  insert into public.organization_plans (
    organization_id, plan,
    custom_max_properties, custom_max_active_units,
    custom_max_collaborators, custom_max_organizations,
    assigned_at
  ) values (
    p_organization_id, p_plan,
    p_custom_max_properties, p_custom_max_active_units,
    p_custom_max_collaborators, p_custom_max_organizations,
    now()
  )
  on conflict (organization_id) do update set
    plan                     = excluded.plan,
    custom_max_properties    = excluded.custom_max_properties,
    custom_max_active_units  = excluded.custom_max_active_units,
    custom_max_collaborators = excluded.custom_max_collaborators,
    custom_max_organizations = excluded.custom_max_organizations,
    assigned_at              = excluded.assigned_at;
end;
$$;

-- private schema: not callable by authenticated/anon directly

-- ---------------------------------------------------------------------------
-- 14. Backfill existant — DÉSACTIVÉ (ALIGN-01 gate correctif 2026-09-02)
-- ---------------------------------------------------------------------------
-- Le backfill automatique vers 'decouverte' est retiré de cette migration.
-- Stratégie : Blaise effectue un inventaire manuel des Organizations existantes
-- (voir rapport gate ALIGN-01), valide le plan cible pour chacune, puis autorise
-- explicitement le backfill via private.assign_organization_plan() ou un patch dédié.
-- ENFORCEMENT CREATE ORGANIZATION → ALIGN-02 (trigger auto_assign_decouverte actif
-- uniquement pour les nouvelles orgs créées après cette migration).
-- ---------------------------------------------------------------------------
-- insert into public.organization_plans (organization_id, plan)
--   select id, 'decouverte'
--   from public.organizations
--   on conflict (organization_id) do nothing;

commit;
