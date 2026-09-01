-- Post-6E targeted patch: portal notification projections and read state.
-- Extends the existing 6C3 notification truth without email, push, backfill or public access.

alter table public.notifications
  add column recipient_tenant_portal_access_id uuid;

alter table public.notifications
  alter column recipient_user_id drop not null;

alter table public.notifications
  add constraint notifications_recipient_scope_check check (
    (recipient_user_id is not null and recipient_tenant_portal_access_id is null)
    or (recipient_user_id is null and recipient_tenant_portal_access_id is not null)
  ),
  add constraint notifications_portal_access_fk
    foreign key (organization_id, recipient_tenant_portal_access_id)
    references public.tenant_portal_accesses (organization_id, id) on delete cascade;

create unique index notifications_portal_deduplication_idx
  on public.notifications (organization_id, recipient_tenant_portal_access_id, deduplication_key)
  where recipient_tenant_portal_access_id is not null;

create index notifications_portal_unread_idx
  on public.notifications (recipient_tenant_portal_access_id, organization_id, created_at desc)
  where recipient_tenant_portal_access_id is not null and read_at is null;

create or replace function private.mirror_financial_notification_to_tenant_portal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recipient_tenant_portal_access_id is not null
    or new.tenant_id is null
    or new.lease_id is null
    or new.notification_type not in (
      'due_notice_ready', 'payment_receipt_ready', 'rent_receipt_ready', 'payment_overdue'
    ) then
    return new;
  end if;

  insert into public.notifications (
    organization_id,
    recipient_user_id,
    recipient_tenant_portal_access_id,
    required_capability,
    notification_type,
    deduplication_key,
    title_code,
    payload,
    document_id,
    tenant_id,
    lease_id
  )
  select
    new.organization_id,
    null,
    access.id,
    new.required_capability,
    new.notification_type,
    new.deduplication_key,
    new.title_code,
    new.payload,
    new.document_id,
    new.tenant_id,
    new.lease_id
  from public.tenant_portal_accesses access
  join public.tenant_portal_lease_accesses lease_access
    on lease_access.organization_id = access.organization_id
    and lease_access.access_id = access.id
    and lease_access.tenant_id = access.tenant_id
    and lease_access.lease_id = new.lease_id
  where access.organization_id = new.organization_id
    and access.tenant_id = new.tenant_id
    and access.status = 'active'
  on conflict (organization_id, recipient_tenant_portal_access_id, deduplication_key)
    where recipient_tenant_portal_access_id is not null
    do nothing;

  return new;
end;
$$;

create trigger notifications_mirror_to_tenant_portal
after insert on public.notifications
for each row execute function private.mirror_financial_notification_to_tenant_portal();

create or replace function public.list_my_tenant_portal_notifications(
  target_access_id uuid,
  result_limit integer default 100
)
returns table (
  notification_id uuid,
  notification_type text,
  title_code text,
  payload jsonb,
  document_id uuid,
  tenant_id uuid,
  lease_id uuid,
  due_id uuid,
  payment_id uuid,
  read_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.has_active_tenant_portal_access(target_access_id)) then
    raise exception 'not_found' using errcode = '42501';
  end if;

  return query
  select
    notification.id,
    notification.notification_type,
    notification.title_code,
    notification.payload,
    notification.document_id,
    notification.tenant_id,
    notification.lease_id,
    document.due_id,
    document.payment_id,
    notification.read_at,
    notification.created_at
  from public.notifications notification
  left join public.financial_documents document
    on document.organization_id = notification.organization_id
    and document.id = notification.document_id
  where notification.recipient_tenant_portal_access_id = target_access_id
  order by notification.created_at desc, notification.id desc
  limit greatest(1, least(coalesce(result_limit, 100), 100));
end;
$$;

create or replace function public.set_tenant_portal_notification_read_state(
  target_access_id uuid,
  target_notification_id uuid,
  target_is_read boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare selected_notification public.notifications%rowtype;
begin
  if not (select private.has_active_tenant_portal_access(target_access_id)) then
    raise exception 'not_found' using errcode = '42501';
  end if;

  select notification.* into selected_notification
  from public.notifications notification
  where notification.id = target_notification_id
    and notification.recipient_tenant_portal_access_id = target_access_id;

  if selected_notification.id is null then
    raise exception 'not_found' using errcode = '42501';
  end if;

  update public.notifications notification
  set read_at = case when target_is_read then now() else null end
  where notification.id = selected_notification.id
    and notification.recipient_tenant_portal_access_id = target_access_id;

  return selected_notification.id;
end;
$$;

create or replace function public.mark_all_tenant_portal_notifications_read(target_access_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  if not (select private.has_active_tenant_portal_access(target_access_id)) then
    raise exception 'not_found' using errcode = '42501';
  end if;

  update public.notifications notification
  set read_at = now()
  where notification.recipient_tenant_portal_access_id = target_access_id
    and notification.read_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- Future due notices expose the already-derived payment allocation. Existing
-- immutable snapshots are not rewritten and no historical document is backfilled.
create or replace function private.document_snapshot_for_due(target_due_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organization_name', op.name,
    'tenant_name', t.full_name,
    'tenant_email', t.email,
    'property_name', p.name,
    'property_locality', p.locality,
    'unit_label', u.label,
    'lease_id', l.id,
    'due_id', d.id,
    'due_reference', d.reference,
    'due_kind', d.kind,
    'period_start', d.period_start,
    'period_end', d.period_end,
    'due_date', d.due_date,
    'notice_date', d.notice_date,
    'rent_xaf', d.rent_amount_xaf,
    'recurring_charges_xaf', d.recurring_charges_amount_xaf,
    'deposit_xaf', d.deposit_amount_xaf,
    'expected_xaf', d.expected_amount_xaf,
    'credit_applied_xaf', ds.covered_by_opening_credit_xaf + ds.covered_by_payment_credit_xaf,
    'payment_allocated_xaf', ds.payment_allocated_xaf,
    'remaining_xaf', ds.remaining_amount_xaf,
    'status', ds.derived_status,
    'available_credit_xaf', fp.available_credit_xaf,
    'covered_periods', fp.covered_periods,
    'last_covered_period_end', fp.last_covered_period_end,
    'next_uncovered_due_date', fp.next_uncovered_due_date,
    'currency', op.currency_code
  )
  from public.dues d
  join public.dues_with_status ds on ds.organization_id = d.organization_id and ds.id = d.id
  join public.leases l on l.organization_id = d.organization_id and l.id = d.lease_id
  join public.tenants t on t.organization_id = d.organization_id and t.id = d.tenant_id
  join public.properties p on p.organization_id = l.organization_id and p.id = l.property_id
  join public.units u on u.organization_id = l.organization_id and u.id = l.unit_id
  join public.organization_profiles op on op.organization_id = d.organization_id
  left join public.tenant_financial_positions fp
    on fp.organization_id = d.organization_id and fp.tenant_id = d.tenant_id
  where d.id = target_due_id;
$$;

revoke all on function private.mirror_financial_notification_to_tenant_portal() from public, anon, authenticated;
revoke all on function public.list_my_tenant_portal_notifications(uuid, integer) from public, anon;
revoke all on function public.set_tenant_portal_notification_read_state(uuid, uuid, boolean) from public, anon;
revoke all on function public.mark_all_tenant_portal_notifications_read(uuid) from public, anon;

grant execute on function public.list_my_tenant_portal_notifications(uuid, integer) to authenticated;
grant execute on function public.set_tenant_portal_notification_read_state(uuid, uuid, boolean) to authenticated;
grant execute on function public.mark_all_tenant_portal_notifications_read(uuid) to authenticated;

comment on function private.mirror_financial_notification_to_tenant_portal() is
  'Mirrors only supported future financial notifications to an active, explicitly lease-scoped TenantPortalAccess.';
comment on function public.list_my_tenant_portal_notifications(uuid, integer) is
  'Lists notifications for one currently active TenantPortalAccess and its bounded Auth session.';
