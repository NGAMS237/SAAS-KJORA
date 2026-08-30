-- LOT 6D — operational dashboard, activity feed, notification centre and Owner audit.
-- Reuses the 6C event/notification/outbox truth. No email switch and no data backfill.

alter table public.administrative_audit_log
  drop constraint administrative_audit_log_action_check;

alter table public.administrative_audit_log
  add constraint administrative_audit_log_action_check check (action in (
    'member.invited', 'member.invitation_resent', 'member.invitation_revoked',
    'member.invitation_accepted', 'member.role_changed', 'member.revoked',
    'owner.transferred', 'payment.reversed', 'document.invalidated'
  ));

create or replace function private.audit_sensitive_domain_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_type not in ('PAYMENT_REVERSED', 'DOCUMENT_INVALIDATED')
    or new.actor_user_id is null then
    return new;
  end if;

  insert into public.administrative_audit_log (
    organization_id, actor_user_id, action, details
  ) values (
    new.organization_id,
    new.actor_user_id,
    case new.event_type
      when 'PAYMENT_REVERSED' then 'payment.reversed'
      else 'document.invalidated'
    end,
    coalesce(new.payload, '{}'::jsonb) || jsonb_build_object(
      'domain_event_id', new.id,
      'aggregate_type', new.aggregate_type,
      'aggregate_id', new.aggregate_id
    )
  );
  return new;
end;
$$;

create trigger domain_events_audit_sensitive_actions
after insert on private.domain_events
for each row execute function private.audit_sensitive_domain_event();

create or replace function public.get_operational_dashboard(
  target_organization_id uuid,
  period_from date,
  period_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  can_view_finance boolean;
  can_view_portfolio boolean;
  result jsonb;
begin
  if current_user_id is null
    or period_from is null
    or period_to is null
    or period_to < period_from
    or not (select private.has_capability(target_organization_id, 'organization.view')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  can_view_finance := (select private.has_capability(target_organization_id, 'due.view'))
    and (select private.has_capability(target_organization_id, 'payment.view'));
  can_view_portfolio := (select private.has_capability(target_organization_id, 'property.view'))
    and (select private.has_capability(target_organization_id, 'unit.view'));

  select jsonb_build_object(
    'period_from', period_from,
    'period_to', period_to,
    'finance_available', can_view_finance,
    'portfolio_available', can_view_portfolio,
    'expected_xaf', case when can_view_finance then (
      select coalesce(sum(ds.net_expected_amount_xaf), 0)::bigint
      from public.dues_with_status ds
      where ds.organization_id = target_organization_id
        and ds.kind in ('periodic', 'initial_prorata')
        and ds.cancelled_at is null
        and ds.due_date between period_from and period_to
    ) end,
    'collected_xaf', case when can_view_finance then (
      select coalesce(sum(p.amount_xaf), 0)::bigint
      from public.payments p
      where p.organization_id = target_organization_id
        and p.status = 'confirmed'
        and p.payment_date between period_from and period_to
    ) end,
    'credit_applied_xaf', case when can_view_finance then (
      select coalesce(sum(ds.covered_by_opening_credit_xaf + ds.covered_by_payment_credit_xaf), 0)::bigint
      from public.dues_with_status ds
      where ds.organization_id = target_organization_id
        and ds.kind in ('periodic', 'initial_prorata')
        and ds.cancelled_at is null
        and ds.due_date between period_from and period_to
    ) end,
    'remaining_xaf', case when can_view_finance then (
      select coalesce(sum(ds.remaining_amount_xaf), 0)::bigint
      from public.dues_with_status ds
      where ds.organization_id = target_organization_id
        and ds.kind in ('periodic', 'initial_prorata')
        and ds.cancelled_at is null
        and ds.due_date between period_from and period_to
    ) end,
    'overdue_xaf', case when can_view_finance then (
      select coalesce(sum(ds.remaining_amount_xaf), 0)::bigint
      from public.dues_with_status ds
      where ds.organization_id = target_organization_id
        and ds.kind in ('periodic', 'initial_prorata')
        and ds.derived_status = 'overdue'
    ) end,
    'overdue_count', case when can_view_finance then (
      select count(*)::integer
      from public.dues_with_status ds
      where ds.organization_id = target_organization_id
        and ds.kind in ('periodic', 'initial_prorata')
        and ds.derived_status = 'overdue'
    ) end,
    'overdue_tenant_count', case when can_view_finance then (
      select count(distinct ds.tenant_id)::integer
      from public.dues_with_status ds
      where ds.organization_id = target_organization_id
        and ds.kind in ('periodic', 'initial_prorata')
        and ds.derived_status = 'overdue'
    ) end,
    'upcoming_count', case when can_view_finance then (
      select count(*)::integer
      from public.dues_with_status ds
      where ds.organization_id = target_organization_id
        and ds.kind in ('periodic', 'initial_prorata')
        and ds.derived_status = 'upcoming'
        and ds.due_date between period_from and period_to
    ) end,
    'partial_count', case when can_view_finance then (
      select count(*)::integer
      from public.dues_with_status ds
      where ds.organization_id = target_organization_id
        and ds.kind in ('periodic', 'initial_prorata')
        and ds.derived_status = 'partially_paid'
        and ds.due_date between period_from and period_to
    ) end,
    'active_tenant_count', case when can_view_finance then (
      select count(distinct l.tenant_id)::integer
      from public.leases l
      where l.organization_id = target_organization_id and l.status = 'active'
    ) end,
    'unit_count', case when can_view_portfolio then (
      select count(*)::integer from public.units u
      where u.organization_id = target_organization_id and u.status = 'active'
    ) end,
    'occupied_unit_count', case when can_view_portfolio then (
      select count(distinct l.unit_id)::integer from public.leases l
      join public.units u on u.organization_id = l.organization_id and u.id = l.unit_id
      where l.organization_id = target_organization_id
        and l.status = 'active' and u.status = 'active'
    ) end
  ) into result;

  return result;
end;
$$;

create or replace function public.list_organization_activity(
  target_organization_id uuid,
  before_created_at timestamptz default null,
  before_event_id uuid default null,
  result_limit integer default 25
)
returns table (
  event_id uuid,
  event_type text,
  aggregate_type text,
  aggregate_id uuid,
  actor_user_id uuid,
  context_label text,
  payload jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not (select private.has_capability(target_organization_id, 'activity.view')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select e.id, e.event_type, e.aggregate_type, e.aggregate_id, e.actor_user_id,
      coalesce(p.name, t.full_name, pay.reference, d.reference, fd.reference, u.label, 'Kjora')::text,
      e.payload, e.created_at
    from private.domain_events e
    left join public.properties p
      on e.aggregate_type = 'property' and p.organization_id = e.organization_id and p.id = e.aggregate_id
    left join public.tenants t
      on e.aggregate_type = 'tenant' and t.organization_id = e.organization_id and t.id = e.aggregate_id
    left join public.payments pay
      on e.aggregate_type = 'payment' and pay.organization_id = e.organization_id and pay.id = e.aggregate_id
    left join public.dues d
      on e.aggregate_type = 'due' and d.organization_id = e.organization_id and d.id = e.aggregate_id
    left join public.financial_documents fd
      on e.aggregate_type = 'financial_document' and fd.organization_id = e.organization_id and fd.id = e.aggregate_id
    left join public.leases l
      on e.aggregate_type = 'lease' and l.organization_id = e.organization_id and l.id = e.aggregate_id
    left join public.units u
      on u.organization_id = l.organization_id and u.id = l.unit_id
    where e.organization_id = target_organization_id
      and (
        e.event_type = 'PROPERTY_CREATED' and (select private.has_capability(target_organization_id, 'property.view'))
        or e.event_type = 'TENANT_CREATED' and (select private.has_capability(target_organization_id, 'tenant.view'))
        or e.event_type in ('LEASE_ACTIVATED', 'LEASE_LEDGER_OPENED') and (select private.has_capability(target_organization_id, 'lease.view'))
        or e.event_type in ('DUE_GENERATED', 'DUE_ADJUSTED') and (select private.has_capability(target_organization_id, 'due.view'))
        or e.event_type in ('PAYMENT_RECORDED', 'PAYMENT_COMPLETED', 'PAYMENT_ALLOCATION_CONFIRMED', 'PAYMENT_REVERSED')
          and (select private.has_capability(target_organization_id, 'payment.view'))
        or e.event_type in ('DOCUMENT_GENERATED', 'DOCUMENT_INVALIDATED')
          and (select private.has_capability(target_organization_id, 'receipt.view'))
        or e.event_type = 'MESSAGE_DELIVERY_FAILED'
          and (select private.has_capability(target_organization_id, 'receipt.share'))
      )
      and (
        before_created_at is null
        or (e.created_at, e.id) < (before_created_at, coalesce(before_event_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
      )
    order by e.created_at desc, e.id desc
    limit greatest(1, least(coalesce(result_limit, 25), 100));
end;
$$;

create or replace function public.mark_all_notifications_read(target_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  if (select auth.uid()) is null
    or not (select private.has_capability(target_organization_id, 'activity.view')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.notifications n
  set read_at = now()
  where n.organization_id = target_organization_id
    and n.recipient_user_id = (select auth.uid())
    and n.read_at is null
    and (select private.has_capability(n.organization_id, n.required_capability));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.set_notification_read_state(
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
  if (select auth.uid()) is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into selected_notification
  from public.notifications n
  where n.id = target_notification_id
    and n.recipient_user_id = (select auth.uid());
  if selected_notification.id is null
    or not (select private.has_capability(selected_notification.organization_id, selected_notification.required_capability)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.notifications
  set read_at = case when target_is_read then now() else null end
  where id = selected_notification.id;
  return selected_notification.id;
end;
$$;

create or replace function public.list_operational_audit(
  target_organization_id uuid,
  before_created_at timestamptz default null,
  before_audit_id uuid default null,
  action_filter text default null,
  actor_filter uuid default null,
  created_from date default null,
  created_to date default null,
  result_limit integer default 25
)
returns table (
  audit_id uuid,
  action text,
  actor_user_id uuid,
  actor_email text,
  target_email text,
  details jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not (select private.has_capability(target_organization_id, 'audit.view')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select a.id, a.action, a.actor_user_id, actor.email::text, target.email::text,
      a.details, a.created_at
    from public.administrative_audit_log a
    left join auth.users actor on actor.id = a.actor_user_id
    left join auth.users target on target.id = a.target_user_id
    where a.organization_id = target_organization_id
      and (action_filter is null or a.action = action_filter)
      and (actor_filter is null or a.actor_user_id = actor_filter)
      and (created_from is null or a.created_at >= created_from::timestamptz)
      and (created_to is null or a.created_at < (created_to + 1)::timestamptz)
      and (
        before_created_at is null
        or (a.created_at, a.id) < (before_created_at, coalesce(before_audit_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
      )
    order by a.created_at desc, a.id desc
    limit greatest(1, least(coalesce(result_limit, 25), 100));
end;
$$;

create or replace function public.get_operational_health(target_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  last_daily_run jsonb;
  document_backlog integer;
  document_failures integer;
  delivery_counts jsonb;
  communication_settings jsonb;
begin
  if (select auth.uid()) is null
    or not (select private.has_capability(target_organization_id, 'audit.view')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'status', jrd.status,
    'started_at', jrd.start_time,
    'finished_at', jrd.end_time
  ) into last_daily_run
  from cron.job_run_details jrd
  join cron.job j on j.jobid = jrd.jobid
  where j.jobname = 'kjora-generate-dues-daily'
  order by jrd.start_time desc
  limit 1;

  select count(*)::integer into document_backlog
  from private.domain_events e
  join private.financial_communication_runtime r on r.singleton
  where e.organization_id = target_organization_id
    and e.created_at >= r.started_at
    and e.event_type in ('PAYMENT_COMPLETED', 'PAYMENT_REVERSED')
    and not exists (
      select 1 from private.financial_document_event_processing p where p.event_id = e.id
    );

  select count(*)::integer into document_failures
  from private.financial_document_event_processing p
  join private.domain_events e on e.id = p.event_id
  where e.organization_id = target_organization_id and p.outcome = 'failed';

  select coalesce(jsonb_object_agg(status, item_count), '{}'::jsonb) into delivery_counts
  from (
    select md.status, count(*)::integer as item_count
    from public.message_deliveries md
    where md.organization_id = target_organization_id
    group by md.status
  ) counts;

  select to_jsonb(settings) - 'updated_by' into communication_settings
  from public.organization_communication_settings settings
  where settings.organization_id = target_organization_id;

  return jsonb_build_object(
    'daily_job', last_daily_run,
    'document_backlog', document_backlog,
    'document_failures', document_failures,
    'delivery_counts', coalesce(delivery_counts, '{}'::jsonb),
    'communication_settings', coalesce(communication_settings, '{}'::jsonb)
  );
end;
$$;

revoke all on function private.audit_sensitive_domain_event() from public, anon, authenticated;
revoke all on function public.get_operational_dashboard(uuid, date, date) from public, anon;
revoke all on function public.list_organization_activity(uuid, timestamptz, uuid, integer) from public, anon;
revoke all on function public.mark_all_notifications_read(uuid) from public, anon;
revoke all on function public.set_notification_read_state(uuid, boolean) from public, anon;
revoke all on function public.list_operational_audit(uuid, timestamptz, uuid, text, uuid, date, date, integer) from public, anon;
revoke all on function public.get_operational_health(uuid) from public, anon;

grant execute on function public.get_operational_dashboard(uuid, date, date) to authenticated;
grant execute on function public.list_organization_activity(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.mark_all_notifications_read(uuid) to authenticated;
grant execute on function public.set_notification_read_state(uuid, boolean) to authenticated;
grant execute on function public.list_operational_audit(uuid, timestamptz, uuid, text, uuid, date, date, integer) to authenticated;
grant execute on function public.get_operational_health(uuid) to authenticated;

comment on function public.get_operational_dashboard(uuid, date, date) is
  'Tenant-scoped operational projection. Finance is null when due/payment capabilities are absent.';
comment on function public.list_organization_activity(uuid, timestamptz, uuid, integer) is
  'Capability-filtered activity projection over immutable domain events.';
comment on function public.mark_all_notifications_read(uuid) is
  'Marks only the authenticated recipient authorized notifications as read.';
comment on function public.set_notification_read_state(uuid, boolean) is
  'Changes read/unread state only for the authenticated authorized recipient.';
comment on function public.list_operational_audit(uuid, timestamptz, uuid, text, uuid, date, date, integer) is
  'Owner-only paginated audit projection; source records remain immutable.';
comment on function public.get_operational_health(uuid) is
  'Owner-only operational health without raw provider errors or secrets.';
