-- LOT 6C3 — immutable financial documents, private delivery outbox and internal notifications.
-- Safe rollout: no historical backfill and every automatic email switch defaults to false.

create sequence public.financial_document_reference_sequence as bigint;

create table public.organization_communication_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  due_notice_email_enabled boolean not null default false,
  overdue_reminder_email_enabled boolean not null default false,
  payment_receipt_email_enabled boolean not null default false,
  rent_receipt_email_enabled boolean not null default false,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

create table public.financial_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  tenant_id uuid not null,
  lease_id uuid,
  due_id uuid,
  payment_id uuid,
  document_type text not null check (document_type in (
    'due_notice', 'payment_receipt', 'rent_receipt', 'account_statement'
  )),
  source_key text not null check (char_length(source_key) between 12 and 240),
  reference_sequence bigint not null default nextval('public.financial_document_reference_sequence'),
  reference text not null check (reference ~ '^(AVI|REC|QUI|ETAT)-[0-9]{4}-[0-9]{6,}$'),
  status text not null default 'prepared' check (status in ('prepared', 'ready', 'invalidated')),
  language text not null check (language in ('fr', 'en')),
  issued_on date not null,
  period_start date,
  period_end date,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  template_version text not null default '6c3-v1' check (char_length(template_version) between 3 and 40),
  storage_path text,
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  content_bytes bigint check (content_bytes is null or content_bytes > 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  invalidated_by uuid references auth.users (id),
  invalidated_at timestamptz,
  invalidation_reason text check (invalidation_reason is null or char_length(invalidation_reason) between 3 and 500),
  constraint financial_documents_organization_id_id_key unique (organization_id, id),
  constraint financial_documents_source_key unique (organization_id, source_key),
  constraint financial_documents_reference_key unique (organization_id, reference),
  constraint financial_documents_tenant_fk foreign key (organization_id, tenant_id)
    references public.tenants (organization_id, id) on delete restrict,
  constraint financial_documents_lease_fk foreign key (organization_id, lease_id)
    references public.leases (organization_id, id) on delete restrict,
  constraint financial_documents_due_fk foreign key (organization_id, due_id)
    references public.dues (organization_id, id) on delete restrict,
  constraint financial_documents_payment_fk foreign key (organization_id, payment_id)
    references public.payments (organization_id, id) on delete restrict,
  constraint financial_documents_period_pair check (
    document_type = 'account_statement' or (period_start is null) = (period_end is null)
  ),
  constraint financial_documents_period_valid check (period_end is null or period_end >= period_start),
  constraint financial_documents_artifact_state check (
    (status = 'prepared' and storage_path is null and content_sha256 is null and content_bytes is null and ready_at is null
      and invalidated_at is null and invalidated_by is null and invalidation_reason is null)
    or (status = 'ready' and storage_path is not null and content_sha256 is not null and content_bytes is not null
      and ready_at is not null and invalidated_at is null and invalidated_by is null and invalidation_reason is null)
    or (status = 'invalidated' and invalidated_at is not null and invalidation_reason is not null)
  )
);

create table public.financial_document_payments (
  organization_id uuid not null references public.organizations (id) on delete restrict,
  document_id uuid not null,
  payment_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, document_id, payment_id),
  constraint financial_document_payments_document_fk foreign key (organization_id, document_id)
    references public.financial_documents (organization_id, id) on delete restrict,
  constraint financial_document_payments_payment_fk foreign key (organization_id, payment_id)
    references public.payments (organization_id, id) on delete restrict
);

create table public.message_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  document_id uuid not null,
  tenant_id uuid not null,
  channel text not null default 'email' check (channel = 'email'),
  recipient_email text not null check (
    recipient_email = lower(trim(recipient_email)) and char_length(recipient_email) between 3 and 320
    and position('@' in recipient_email) > 1
  ),
  language text not null check (language in ('fr', 'en')),
  template_key text not null check (char_length(template_key) between 3 and 80),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 280),
  trigger_type text not null check (trigger_type in ('automatic', 'manual')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
  next_attempt_at timestamptz,
  provider text check (provider is null or provider = 'resend'),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 80),
  last_error_message text check (last_error_message is null or char_length(last_error_message) <= 500),
  requested_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint message_deliveries_organization_id_id_key unique (organization_id, id),
  constraint message_deliveries_idempotency_key unique (organization_id, idempotency_key),
  constraint message_deliveries_document_fk foreign key (organization_id, document_id)
    references public.financial_documents (organization_id, id) on delete restrict,
  constraint message_deliveries_tenant_fk foreign key (organization_id, tenant_id)
    references public.tenants (organization_id, id) on delete restrict,
  constraint message_deliveries_sent_state check (
    (status = 'sent' and sent_at is not null and provider = 'resend' and provider_message_id is not null)
    or (status <> 'sent' and sent_at is null)
  )
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  required_capability text not null check (required_capability in ('due.view', 'payment.view', 'receipt.view')),
  notification_type text not null check (notification_type in (
    'due_notice_ready', 'payment_receipt_ready', 'rent_receipt_ready', 'payment_overdue',
    'last_prepaid_period', 'low_credit', 'delivery_failed'
  )),
  deduplication_key text not null check (char_length(deduplication_key) between 12 and 280),
  title_code text not null check (char_length(title_code) between 3 and 100),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  document_id uuid,
  tenant_id uuid,
  lease_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_deduplication_key unique (organization_id, recipient_user_id, deduplication_key),
  constraint notifications_document_fk foreign key (organization_id, document_id)
    references public.financial_documents (organization_id, id) on delete restrict,
  constraint notifications_tenant_fk foreign key (organization_id, tenant_id)
    references public.tenants (organization_id, id) on delete restrict,
  constraint notifications_lease_fk foreign key (organization_id, lease_id)
    references public.leases (organization_id, id) on delete restrict
);

create table private.financial_communication_runtime (
  singleton boolean primary key default true check (singleton),
  started_at timestamptz not null default now()
);

insert into private.financial_communication_runtime (singleton) values (true);

create table private.financial_document_event_processing (
  event_id uuid primary key references private.domain_events (id) on delete restrict,
  processed_at timestamptz not null default now(),
  outcome text not null check (outcome in ('prepared', 'invalidated', 'ignored', 'failed')),
  attempt_count smallint not null default 1 check (attempt_count between 1 and 3),
  next_attempt_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500)
);

create index financial_documents_tenant_created_idx
  on public.financial_documents (organization_id, tenant_id, created_at desc);
create index financial_documents_lease_created_idx
  on public.financial_documents (organization_id, lease_id, created_at desc) where lease_id is not null;
create index financial_documents_payment_idx
  on public.financial_documents (organization_id, payment_id) where payment_id is not null;
create index financial_documents_due_idx
  on public.financial_documents (organization_id, due_id) where due_id is not null;
create index financial_documents_status_idx
  on public.financial_documents (organization_id, status, created_at desc);
create index financial_document_payments_payment_idx
  on public.financial_document_payments (organization_id, payment_id);
create index message_deliveries_queue_idx
  on public.message_deliveries (status, next_attempt_at, created_at) where status in ('pending', 'failed');
create index message_deliveries_document_idx
  on public.message_deliveries (organization_id, document_id, created_at desc);
create index notifications_recipient_unread_idx
  on public.notifications (recipient_user_id, organization_id, created_at desc) where read_at is null;

alter table public.organization_communication_settings enable row level security;
alter table public.financial_documents enable row level security;
alter table public.financial_document_payments enable row level security;
alter table public.message_deliveries enable row level security;
alter table public.notifications enable row level security;

create or replace function private.set_financial_document_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
declare document_prefix text;
begin
  document_prefix := case new.document_type
    when 'due_notice' then 'AVI'
    when 'payment_receipt' then 'REC'
    when 'rent_receipt' then 'QUI'
    when 'account_statement' then 'ETAT'
  end;
  new.reference := document_prefix || '-' || extract(year from new.issued_on)::integer::text || '-'
    || lpad(new.reference_sequence::text, 6, '0');
  return new;
end;
$$;

create trigger financial_documents_set_reference
before insert on public.financial_documents
for each row execute function private.set_financial_document_reference();

create policy "owners read communication settings"
on public.organization_communication_settings for select to authenticated
using ((select private.is_organization_owner(organization_id)));

create policy "owners update communication settings"
on public.organization_communication_settings for update to authenticated
using ((select private.is_organization_owner(organization_id)))
with check ((select private.is_organization_owner(organization_id)));

create policy "authorized members read financial documents"
on public.financial_documents for select to authenticated
using ((select private.has_capability(
  organization_id,
  case when document_type in ('payment_receipt', 'rent_receipt') then 'receipt.view' else 'due.view' end
)));

create policy "authorized members read financial document payments"
on public.financial_document_payments for select to authenticated
using ((select private.has_capability(organization_id, 'receipt.view')));

create policy "authorized members read delivery history"
on public.message_deliveries for select to authenticated
using ((select private.has_capability(organization_id, 'receipt.share')));

create policy "recipients read authorized notifications"
on public.notifications for select to authenticated
using (
  recipient_user_id = (select auth.uid())
  and (select private.has_capability(organization_id, required_capability))
);

create policy "recipients mark authorized notifications read"
on public.notifications for update to authenticated
using (
  recipient_user_id = (select auth.uid())
  and (select private.has_capability(organization_id, required_capability))
)
with check (
  recipient_user_id = (select auth.uid())
  and (select private.has_capability(organization_id, required_capability))
);

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
    'remaining_xaf', ds.remaining_amount_xaf,
    'status', ds.derived_status,
    'available_credit_xaf', fp.available_credit_xaf,
    'covered_periods', fp.covered_periods,
    'last_covered_period_end', fp.last_covered_period_end,
    'next_uncovered_due_date', fp.next_uncovered_due_date,
    'currency', 'XAF'
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

create or replace function private.notify_authorized_members(
  target_organization_id uuid,
  target_capability text,
  target_type text,
  target_key text,
  target_title_code text,
  target_payload jsonb,
  target_document_id uuid,
  target_tenant_id uuid,
  target_lease_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (
    organization_id, recipient_user_id, required_capability, notification_type,
    deduplication_key, title_code, payload, document_id, tenant_id, lease_id
  )
  select target_organization_id, m.user_id, target_capability, target_type,
    target_key, target_title_code, coalesce(target_payload, '{}'::jsonb),
    target_document_id, target_tenant_id, target_lease_id
  from public.memberships m
  join public.role_capabilities rc on rc.role = m.role and rc.capability = target_capability
  where m.organization_id = target_organization_id and m.status = 'active'
    and m.role in ('organization_owner', 'manager')
  on conflict (organization_id, recipient_user_id, deduplication_key) do nothing;
$$;

create or replace function private.queue_automatic_delivery(target_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_document public.financial_documents%rowtype;
  recipient text;
  enabled boolean := false;
begin
  select * into selected_document from public.financial_documents where id = target_document_id;
  select lower(trim(t.email)) into recipient
  from public.tenants t
  where t.organization_id = selected_document.organization_id and t.id = selected_document.tenant_id;
  if recipient is null then return; end if;

  select case selected_document.document_type
    when 'due_notice' then s.due_notice_email_enabled
    when 'payment_receipt' then s.payment_receipt_email_enabled
    when 'rent_receipt' then s.rent_receipt_email_enabled
    else false end
  into enabled
  from public.organization_communication_settings s
  where s.organization_id = selected_document.organization_id;
  if not coalesce(enabled, false) then return; end if;

  insert into public.message_deliveries (
    organization_id, document_id, tenant_id, recipient_email, language,
    template_key, idempotency_key, trigger_type, next_attempt_at
  ) values (
    selected_document.organization_id, selected_document.id, selected_document.tenant_id,
    recipient, selected_document.language, selected_document.document_type,
    'automatic:' || selected_document.id::text || ':' || recipient,
    'automatic', now()
  ) on conflict (organization_id, idempotency_key) do nothing;
end;
$$;

create or replace function private.prepare_payment_documents(target_payment_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_payment public.payments%rowtype;
  payment_document_id uuid;
  rent_document_id uuid;
  due_item record;
  created_count integer := 0;
  selected_language text;
  payment_snapshot jsonb;
begin
  select * into selected_payment from public.payments where id = target_payment_id and status = 'confirmed';
  if selected_payment.id is null then return 0; end if;
  select coalesce(t.preferred_language, op.language) into selected_language
  from public.tenants t join public.organization_profiles op on op.organization_id = t.organization_id
  where t.organization_id = selected_payment.organization_id and t.id = selected_payment.tenant_id;

  select jsonb_build_object(
    'organization_name', op.name,
    'tenant_name', t.full_name,
    'tenant_email', t.email,
    'property_name', pr.name,
    'property_locality', pr.locality,
    'unit_label', u.label,
    'payment_id', p.id,
    'payment_reference', p.reference,
    'payment_date', p.payment_date,
    'recorded_at', p.created_at,
    'amount_xaf', p.amount_xaf,
    'method', p.method,
    'external_reference', p.external_reference,
    'balance_after_xaf', p.balance_after_xaf,
    'allocated_xaf', coalesce((select sum(a.amount_xaf) from public.payment_allocations a where a.payment_id = p.id), 0),
    'rent_allocated_xaf', coalesce((select sum(a.rent_amount_xaf) from public.payment_allocations a where a.payment_id = p.id), 0),
    'recurring_charges_allocated_xaf', coalesce((select sum(a.recurring_charges_amount_xaf) from public.payment_allocations a where a.payment_id = p.id), 0),
    'deposit_allocated_xaf', coalesce((select sum(a.deposit_amount_xaf) from public.payment_allocations a where a.payment_id = p.id), 0),
    'allocations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'due_reference', d.reference,
        'due_kind', d.kind,
        'period_start', d.period_start,
        'period_end', d.period_end,
        'amount_xaf', a.amount_xaf,
        'rent_xaf', a.rent_amount_xaf,
        'recurring_charges_xaf', a.recurring_charges_amount_xaf,
        'deposit_xaf', a.deposit_amount_xaf
      ) order by d.due_date, d.id), '[]'::jsonb)
      from public.payment_allocations a
      join public.dues d on d.organization_id = a.organization_id and d.id = a.due_id
      where a.organization_id = p.organization_id and a.payment_id = p.id
    ),
    'credit_created_xaf', p.amount_xaf - coalesce((select sum(a.amount_xaf) from public.payment_allocations a where a.payment_id = p.id), 0),
    'currency', p.currency
  ) into payment_snapshot
  from public.payments p
  join public.tenants t on t.organization_id = p.organization_id and t.id = p.tenant_id
  join public.leases l on l.organization_id = p.organization_id and l.id = p.lease_id
  join public.properties pr on pr.organization_id = l.organization_id and pr.id = l.property_id
  join public.units u on u.organization_id = l.organization_id and u.id = l.unit_id
  join public.organization_profiles op on op.organization_id = p.organization_id
  where p.id = selected_payment.id;

  insert into public.financial_documents (
    organization_id, tenant_id, lease_id, payment_id, document_type, source_key,
    reference, language, issued_on, snapshot, created_by
  ) values (
    selected_payment.organization_id, selected_payment.tenant_id, selected_payment.lease_id,
    selected_payment.id, 'payment_receipt', 'payment_receipt:' || selected_payment.id::text,
    'REC-' || selected_payment.reference, selected_language, selected_payment.payment_date,
    payment_snapshot, selected_payment.created_by
  ) on conflict (organization_id, source_key) do nothing
  returning id into payment_document_id;

  if payment_document_id is not null then
    created_count := created_count + 1;
    insert into public.financial_document_payments (organization_id, document_id, payment_id)
      values (selected_payment.organization_id, payment_document_id, selected_payment.id);
    perform private.notify_authorized_members(
      selected_payment.organization_id, 'receipt.view', 'payment_receipt_ready',
      'payment_receipt_ready:' || selected_payment.id::text, 'payment_receipt_ready',
      jsonb_build_object('payment_reference', selected_payment.reference, 'amount_xaf', selected_payment.amount_xaf),
      payment_document_id, selected_payment.tenant_id, selected_payment.lease_id
    );
    perform private.queue_automatic_delivery(payment_document_id);
  end if;

  for due_item in
    select distinct ds.id, ds.reference, ds.period_start, ds.period_end, ds.due_date
    from public.payment_allocations a
    join public.dues_with_status ds on ds.organization_id = a.organization_id and ds.id = a.due_id
    where a.organization_id = selected_payment.organization_id
      and a.payment_id = selected_payment.id
      and ds.kind in ('periodic', 'initial_prorata')
      and ds.rent_amount_xaf > 0 and ds.remaining_amount_xaf = 0
  loop
    insert into public.financial_documents (
      organization_id, tenant_id, lease_id, due_id, document_type, source_key, reference,
      language, issued_on, period_start, period_end, snapshot, created_by
    ) values (
      selected_payment.organization_id, selected_payment.tenant_id, selected_payment.lease_id,
      due_item.id, 'rent_receipt', 'rent_receipt:' || due_item.id::text,
      'QUI-' || due_item.reference, selected_language, selected_payment.payment_date,
      due_item.period_start, due_item.period_end,
      private.document_snapshot_for_due(due_item.id) || jsonb_build_object(
        'settled_on', selected_payment.payment_date,
        'payment_references', (
          select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'reference', p.reference, 'amount_xaf', a.amount_xaf)
            order by p.payment_date, p.created_at), '[]'::jsonb)
          from public.payment_allocations a join public.payments p on p.id = a.payment_id
          where a.due_id = due_item.id and p.status = 'confirmed'
        )
      ), selected_payment.created_by
    ) on conflict (organization_id, source_key) do nothing
    returning id into rent_document_id;

    if rent_document_id is not null then
      created_count := created_count + 1;
      insert into public.financial_document_payments (organization_id, document_id, payment_id)
      select selected_payment.organization_id, rent_document_id, a.payment_id
      from public.payment_allocations a join public.payments p on p.id = a.payment_id
      where a.organization_id = selected_payment.organization_id and a.due_id = due_item.id and p.status = 'confirmed'
      on conflict do nothing;
      perform private.notify_authorized_members(
        selected_payment.organization_id, 'receipt.view', 'rent_receipt_ready',
        'rent_receipt_ready:' || due_item.id::text, 'rent_receipt_ready',
        jsonb_build_object('due_reference', due_item.reference, 'period_start', due_item.period_start, 'period_end', due_item.period_end),
        rent_document_id, selected_payment.tenant_id, selected_payment.lease_id
      );
      perform private.queue_automatic_delivery(rent_document_id);
    end if;
  end loop;
  return created_count;
end;
$$;

create or replace function private.invalidate_payment_documents(target_payment_id uuid, target_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer := 0; item record;
begin
  for item in
    select d.id, d.organization_id, d.reference, d.document_type,
      (select p.reversed_by from public.payments p where p.id = target_payment_id) as actor_user_id
    from public.financial_documents d
    where d.status <> 'invalidated' and exists (
      select 1 from public.financial_document_payments dp
      where dp.organization_id = d.organization_id and dp.document_id = d.id and dp.payment_id = target_payment_id
    )
  loop
    perform set_config('kjora.document_maintenance', 'invalidate', true);
    update public.financial_documents set status = 'invalidated', invalidated_at = now(),
      invalidation_reason = target_reason, invalidated_by = item.actor_user_id
    where id = item.id;
    changed := changed + 1;
    insert into private.domain_events (
      organization_id, event_type, aggregate_type, aggregate_id, actor_user_id, payload
    ) values (
      item.organization_id, 'DOCUMENT_INVALIDATED', 'financial_document', item.id, item.actor_user_id,
      jsonb_build_object('reference', item.reference, 'document_type', item.document_type,
        'payment_id', target_payment_id, 'reason', target_reason)
    ) on conflict (event_type, aggregate_id) do nothing;
  end loop;
  update public.message_deliveries md set status = 'cancelled', updated_at = now()
  where md.status in ('pending', 'failed') and exists (
    select 1 from public.financial_document_payments dp
    where dp.organization_id = md.organization_id and dp.document_id = md.document_id and dp.payment_id = target_payment_id
  );
  return changed;
end;
$$;

create or replace function private.process_financial_document_events(batch_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare item record; processed integer := 0; event_outcome text;
begin
  if batch_limit not between 1 and 500 then raise exception 'invalid_batch_limit' using errcode = '22023'; end if;
  for item in
    select e.* from private.domain_events e
    cross join private.financial_communication_runtime r
    left join private.financial_document_event_processing p on p.event_id = e.id
    where e.created_at >= r.started_at
      and e.event_type in ('PAYMENT_COMPLETED', 'PAYMENT_REVERSED')
      and (p.event_id is null or (p.outcome = 'failed' and p.attempt_count < 3 and p.next_attempt_at <= now()))
    order by e.created_at, e.id limit batch_limit
    for update of e skip locked
  loop
    begin
      if item.event_type = 'PAYMENT_COMPLETED' then
        perform private.prepare_payment_documents(item.aggregate_id);
        event_outcome := 'prepared';
      elsif item.event_type = 'PAYMENT_REVERSED' then
        perform private.invalidate_payment_documents(item.aggregate_id, 'payment_reversed');
        event_outcome := 'invalidated';
      else
        event_outcome := 'ignored';
      end if;
      insert into private.financial_document_event_processing (event_id, outcome)
        values (item.id, event_outcome)
      on conflict (event_id) do update set outcome = excluded.outcome, processed_at = now(),
        next_attempt_at = null, last_error = null;
      processed := processed + 1;
    exception when others then
      insert into private.financial_document_event_processing (
        event_id, outcome, attempt_count, next_attempt_at, last_error
      ) values (
        item.id, 'failed', 1, now() + interval '5 minutes', left(sqlerrm, 500)
      ) on conflict (event_id) do update set
        outcome = 'failed', attempt_count = least(private.financial_document_event_processing.attempt_count + 1, 3),
        processed_at = now(),
        next_attempt_at = case private.financial_document_event_processing.attempt_count + 1
          when 2 then now() + interval '30 minutes'
          else now() + interval '120 minutes' end,
        last_error = left(sqlerrm, 500);
    end;
  end loop;
  return processed;
end;
$$;

create or replace function private.prepare_financial_communications(run_on date default current_date)
returns table (
  due_notices integer,
  overdue_notifications integer,
  prepaid_notifications integer,
  low_credit_notifications integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  document_id uuid;
  notices integer := 0;
  reminders integer := 0;
  prepaid_alerts integer := 0;
  low_credit_alerts integer := 0;
  selected_language text;
begin
  for item in
    select d.*, ds.remaining_amount_xaf
    from public.dues d join public.dues_with_status ds on ds.organization_id = d.organization_id and ds.id = d.id
    where d.notice_date = run_on and d.cancelled_at is null and d.kind <> 'adjustment' and ds.remaining_amount_xaf > 0
  loop
    select coalesce(t.preferred_language, op.language) into selected_language
    from public.tenants t join public.organization_profiles op on op.organization_id = t.organization_id
    where t.organization_id = item.organization_id and t.id = item.tenant_id;
    insert into public.financial_documents (
      organization_id, tenant_id, lease_id, due_id, document_type, source_key, reference,
      language, issued_on, period_start, period_end, snapshot, created_by
    ) values (
      item.organization_id, item.tenant_id, item.lease_id, item.id, 'due_notice',
      'due_notice:' || item.id::text, 'AVI-' || item.reference, selected_language,
      run_on, item.period_start, item.period_end, private.document_snapshot_for_due(item.id), item.created_by
    ) on conflict (organization_id, source_key) do nothing returning id into document_id;
    if document_id is not null then
      notices := notices + 1;
      perform private.notify_authorized_members(
        item.organization_id, 'due.view', 'due_notice_ready', 'due_notice_ready:' || item.id::text,
        'due_notice_ready', jsonb_build_object('due_reference', item.reference, 'due_date', item.due_date,
          'remaining_xaf', item.remaining_amount_xaf), document_id, item.tenant_id, item.lease_id
      );
      perform private.queue_automatic_delivery(document_id);
    end if;
  end loop;

  for item in
    select ds.id, ds.organization_id, ds.tenant_id, ds.lease_id, ds.reference,
      ds.due_date, ds.remaining_amount_xaf, d.created_by
    from public.dues_with_status ds join public.dues d on d.organization_id = ds.organization_id and d.id = ds.id
    where ds.next_reminder_date = run_on and ds.remaining_amount_xaf > 0 and ds.derived_status = 'overdue'
  loop
    perform private.notify_authorized_members(
      item.organization_id, 'due.view', 'payment_overdue',
      'payment_overdue:' || item.id::text || ':' || run_on::text, 'payment_overdue',
      jsonb_build_object('due_reference', item.reference, 'due_date', item.due_date,
        'remaining_xaf', item.remaining_amount_xaf, 'reminder_date', run_on),
      null, item.tenant_id, item.lease_id
    );
    insert into public.message_deliveries (
      organization_id, document_id, tenant_id, recipient_email, language, template_key,
      idempotency_key, trigger_type, next_attempt_at
    )
    select item.organization_id, d.id, item.tenant_id, lower(trim(t.email)),
      coalesce(t.preferred_language, op.language), 'overdue_reminder',
      'automatic:overdue:' || item.id::text || ':' || run_on::text,
      'automatic', now()
    from public.financial_documents d
    join public.tenants t on t.organization_id = item.organization_id and t.id = item.tenant_id
    join public.organization_profiles op on op.organization_id = item.organization_id
    join public.organization_communication_settings s on s.organization_id = item.organization_id
    where d.organization_id = item.organization_id and d.due_id = item.id
      and d.document_type = 'due_notice' and d.status <> 'invalidated'
      and t.email is not null and s.overdue_reminder_email_enabled
    on conflict (organization_id, idempotency_key) do nothing;
    reminders := reminders + 1;
  end loop;

  -- The same J-X boundary that prepares the notice is the least surprising
  -- moment to explain that prepaid coverage has ended. The email, when an
  -- Organization explicitly enables it, remains the single due-notice email.
  for item in
    select d.id, d.organization_id, d.tenant_id, d.lease_id, d.reference,
      d.period_start, d.due_date,
      d.expected_amount_xaf, ds.remaining_amount_xaf,
      (ds.covered_by_opening_credit_xaf + ds.covered_by_payment_credit_xaf)::bigint as credit_applied_xaf,
      (
        select count(*)::integer from public.dues_with_status previous_due
        where previous_due.organization_id = d.organization_id
          and previous_due.lease_id = d.lease_id
          and previous_due.kind in ('periodic', 'initial_prorata')
          and previous_due.remaining_amount_xaf = 0
          and previous_due.covered_by_opening_credit_xaf + previous_due.covered_by_payment_credit_xaf > 0
      ) as prepaid_covered_periods,
      (
        select max(previous_due.period_end) from public.dues_with_status previous_due
        where previous_due.organization_id = d.organization_id
          and previous_due.lease_id = d.lease_id
          and previous_due.kind in ('periodic', 'initial_prorata')
          and previous_due.remaining_amount_xaf = 0
          and previous_due.covered_by_opening_credit_xaf + previous_due.covered_by_payment_credit_xaf > 0
      ) as last_prepaid_period_end,
      fp.next_uncovered_due_date
    from public.dues d
    join public.dues_with_status ds
      on ds.organization_id = d.organization_id and ds.id = d.id
    join public.tenant_financial_positions fp
      on fp.organization_id = d.organization_id and fp.tenant_id = d.tenant_id
    where d.notice_date = run_on
      and d.cancelled_at is null
      and d.kind in ('periodic', 'initial_prorata')
      and ds.remaining_amount_xaf > 0
  loop
    if item.prepaid_covered_periods > 0 and item.last_prepaid_period_end is not null
      and item.period_start = item.last_prepaid_period_end + 1
      and item.next_uncovered_due_date = item.due_date then
      perform private.notify_authorized_members(
        item.organization_id, 'due.view', 'last_prepaid_period',
        'last_prepaid_period:' || item.lease_id::text || ':' || item.last_prepaid_period_end::text
          || ':' || item.due_date::text,
        'last_prepaid_period',
        jsonb_build_object(
          'due_reference', item.reference,
          'covered_periods', item.prepaid_covered_periods,
          'last_covered_period_end', item.last_prepaid_period_end,
          'next_uncovered_due_date', item.due_date,
          'remaining_xaf', item.remaining_amount_xaf
        ),
        null, item.tenant_id, item.lease_id
      );
      prepaid_alerts := prepaid_alerts + 1;
    end if;

    if item.credit_applied_xaf > 0 and item.remaining_amount_xaf > 0 then
      perform private.notify_authorized_members(
        item.organization_id, 'due.view', 'low_credit',
        'low_credit:' || item.id::text || ':' || run_on::text,
        'low_credit',
        jsonb_build_object(
          'due_reference', item.reference,
          'credit_applied_xaf', item.credit_applied_xaf,
          'next_due_amount_xaf', item.expected_amount_xaf,
          'expected_remainder_xaf', item.remaining_amount_xaf,
          'next_uncovered_due_date', item.due_date
        ),
        null, item.tenant_id, item.lease_id
      );
      low_credit_alerts := low_credit_alerts + 1;
    end if;
  end loop;

  return query select notices, reminders, prepaid_alerts, low_credit_alerts;
end;
$$;

create or replace function private.run_financial_daily(run_on date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare generated_dues integer; communication_result record; processed_events integer;
begin
  generated_dues := private.generate_due_schedules(run_on);
  processed_events := private.process_financial_document_events(100);
  select * into communication_result from private.prepare_financial_communications(run_on);
  return jsonb_build_object('generated_dues', generated_dues, 'due_notices', communication_result.due_notices,
    'overdue_notifications', communication_result.overdue_notifications,
    'prepaid_notifications', communication_result.prepaid_notifications,
    'low_credit_notifications', communication_result.low_credit_notifications,
    'processed_financial_events', processed_events, 'email_automation', false);
end;
$$;

create or replace function public.prepare_account_statement(
  target_tenant_id uuid,
  period_from date default null,
  period_to date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_tenant public.tenants%rowtype;
  selected_language text;
  document_id uuid;
  source_suffix text;
  statement_snapshot jsonb;
begin
  select * into selected_tenant from public.tenants where id = target_tenant_id;
  if current_user_id is null or selected_tenant.id is null
    or not (select private.has_capability(selected_tenant.organization_id, 'due.view')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if period_from is not null and period_to is not null and period_to < period_from then
    raise exception 'invalid_statement_period' using errcode = '22023';
  end if;
  select coalesce(selected_tenant.preferred_language, op.language) into selected_language
  from public.organization_profiles op where op.organization_id = selected_tenant.organization_id;
  source_suffix := coalesce(period_from::text, 'start') || ':' || coalesce(period_to::text, 'today')
    || ':' || current_date::text || ':' || coalesce((
      select count(*)::text || ':' || coalesce(max(le.created_at)::text, 'empty')
      from public.ledger_entries le
      where le.organization_id = selected_tenant.organization_id and le.tenant_id = selected_tenant.id
        and (period_to is null or le.occurred_on <= period_to)
    ), '0:empty');

  select jsonb_build_object(
    'organization_name', op.name,
    'tenant_name', selected_tenant.full_name,
    'tenant_email', selected_tenant.email,
    'period_from', period_from,
    'period_to', period_to,
    'issued_on', current_date,
    'currency', 'XAF',
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', ls.occurred_on, 'type', ls.entry_type, 'reference', ls.reference,
        'period_start', ls.period_start, 'period_end', ls.period_end,
        'debit_xaf', ls.debit_xaf, 'credit_xaf', ls.credit_xaf,
        'balance_xaf', ls.tenant_running_balance_xaf
      ) order by ls.occurred_on, ls.sort_order, ls.created_at, ls.id)
      from (
        select le.*, sum(le.credit_xaf - le.debit_xaf) over (
          partition by le.organization_id, le.tenant_id
          order by le.occurred_on, le.sort_order, le.created_at, le.id
          rows between unbounded preceding and current row
        )::bigint as tenant_running_balance_xaf
        from public.ledger_entries le
        where le.organization_id = selected_tenant.organization_id and le.tenant_id = selected_tenant.id
          and (period_to is null or le.occurred_on <= period_to)
      ) ls
      where period_from is null or ls.occurred_on >= period_from
    ), '[]'::jsonb),
    'closing_balance_xaf', coalesce((
      select sum(le.credit_xaf - le.debit_xaf)::bigint from public.ledger_entries le
      where le.organization_id = selected_tenant.organization_id and le.tenant_id = selected_tenant.id
        and (period_to is null or le.occurred_on <= period_to)
    ), 0)
  ) into statement_snapshot
  from public.organization_profiles op where op.organization_id = selected_tenant.organization_id;

  insert into public.financial_documents (
    organization_id, tenant_id, document_type, source_key, reference, language,
    issued_on, period_start, period_end, snapshot, created_by
  ) values (
    selected_tenant.organization_id, selected_tenant.id, 'account_statement',
    'account_statement:' || selected_tenant.id::text || ':' || source_suffix,
    'STMT-' || to_char(current_date, 'YYYYMMDD') || '-'
      || upper(left(replace(selected_tenant.id::text, '-', ''), 8)) || '-'
      || upper(left(pg_catalog.md5(source_suffix), 6)),
    selected_language, current_date, period_from, period_to, statement_snapshot, current_user_id
  ) on conflict (organization_id, source_key) do nothing
  returning id into document_id;
  if document_id is null then
    select id into document_id from public.financial_documents
    where organization_id = selected_tenant.organization_id
      and source_key = 'account_statement:' || selected_tenant.id::text || ':' || source_suffix;
  end if;
  return document_id;
end;
$$;

create or replace function private.protect_financial_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'financial_document_history_is_immutable' using errcode = '23514'; end if;
  if current_setting('kjora.document_maintenance', true) = 'finalize'
    and old.status = 'prepared' and new.status = 'ready'
    and to_jsonb(new) - array['status', 'storage_path', 'content_sha256', 'content_bytes', 'ready_at']
      = to_jsonb(old) - array['status', 'storage_path', 'content_sha256', 'content_bytes', 'ready_at'] then
    return new;
  end if;
  if current_setting('kjora.document_maintenance', true) = 'invalidate'
    and old.status in ('prepared', 'ready') and new.status = 'invalidated'
    and to_jsonb(new) - array['status', 'invalidated_by', 'invalidated_at', 'invalidation_reason']
      = to_jsonb(old) - array['status', 'invalidated_by', 'invalidated_at', 'invalidation_reason'] then
    return new;
  end if;
  raise exception 'financial_document_history_is_immutable' using errcode = '23514';
end;
$$;

create trigger financial_documents_protect_history
before update or delete on public.financial_documents
for each row execute function private.protect_financial_document();

create trigger financial_document_payments_protect_history
before update or delete on public.financial_document_payments
for each row execute function private.reject_financial_history_mutation();

create or replace function public.finalize_financial_document(
  target_document_id uuid,
  target_storage_path text,
  target_content_sha256 text,
  target_content_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare selected_document public.financial_documents%rowtype; required_capability text;
begin
  select * into selected_document from public.financial_documents where id = target_document_id for update;
  required_capability := case when selected_document.document_type in ('payment_receipt', 'rent_receipt')
    then 'receipt.view' else 'due.view' end;
  if selected_document.id is null or not (select private.has_capability(selected_document.organization_id, required_capability)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if selected_document.status = 'invalidated' then raise exception 'document_invalidated' using errcode = '23514'; end if;
  if target_storage_path <> selected_document.organization_id::text || '/' || selected_document.id::text || '/v1.pdf'
    or target_content_sha256 !~ '^[0-9a-f]{64}$' or target_content_bytes <= 0 then
    raise exception 'invalid_document_artifact' using errcode = '22023';
  end if;
  if selected_document.status = 'ready' then return selected_document.id; end if;
  perform set_config('kjora.document_maintenance', 'finalize', true);
  update public.financial_documents set status = 'ready', storage_path = target_storage_path,
    content_sha256 = target_content_sha256, content_bytes = target_content_bytes, ready_at = now()
  where id = selected_document.id;
  insert into private.domain_events (
    organization_id, event_type, aggregate_type, aggregate_id, actor_user_id, payload
  ) values (
    selected_document.organization_id, 'DOCUMENT_GENERATED', 'financial_document', selected_document.id,
    (select auth.uid()), jsonb_build_object('document_type', selected_document.document_type,
      'reference', selected_document.reference, 'template_version', selected_document.template_version)
  ) on conflict (event_type, aggregate_id) do nothing;
  return selected_document.id;
end;
$$;

create or replace function public.finalize_financial_document_system(
  target_document_id uuid,
  target_storage_path text,
  target_content_sha256 text,
  target_content_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare selected_document public.financial_documents%rowtype; system_actor uuid;
begin
  select * into selected_document from public.financial_documents where id = target_document_id for update;
  if selected_document.id is null or selected_document.status = 'invalidated' then
    raise exception 'document_unavailable' using errcode = '23514';
  end if;
  if target_storage_path <> selected_document.organization_id::text || '/' || selected_document.id::text || '/v1.pdf'
    or target_content_sha256 !~ '^[0-9a-f]{64}$' or target_content_bytes <= 0 then
    raise exception 'invalid_document_artifact' using errcode = '22023';
  end if;
  if selected_document.status = 'ready' then return selected_document.id; end if;
  perform set_config('kjora.document_maintenance', 'finalize', true);
  update public.financial_documents set status = 'ready', storage_path = target_storage_path,
    content_sha256 = target_content_sha256, content_bytes = target_content_bytes, ready_at = now()
  where id = selected_document.id;
  select coalesce(selected_document.created_by, o.created_by) into system_actor
  from public.organizations o where o.id = selected_document.organization_id;
  insert into private.domain_events (
    organization_id, event_type, aggregate_type, aggregate_id, actor_user_id, payload
  ) values (
    selected_document.organization_id, 'DOCUMENT_GENERATED', 'financial_document', selected_document.id,
    system_actor, jsonb_build_object('document_type', selected_document.document_type,
      'reference', selected_document.reference, 'template_version', selected_document.template_version,
      'generated_by', 'delivery_worker')
  ) on conflict (event_type, aggregate_id) do nothing;
  return selected_document.id;
end;
$$;

create or replace function public.queue_financial_document_email(target_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare selected_document public.financial_documents%rowtype; recipient text; delivery_id uuid;
begin
  select * into selected_document from public.financial_documents where id = target_document_id;
  if selected_document.id is null or selected_document.status = 'invalidated'
    or not (select private.has_capability(selected_document.organization_id, 'receipt.share')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select lower(trim(email)) into recipient from public.tenants
  where organization_id = selected_document.organization_id and id = selected_document.tenant_id;
  if recipient is null then raise exception 'tenant_email_required' using errcode = '23514'; end if;
  insert into public.message_deliveries (
    organization_id, document_id, tenant_id, recipient_email, language, template_key,
    idempotency_key, trigger_type, requested_by, next_attempt_at
  ) values (
    selected_document.organization_id, selected_document.id, selected_document.tenant_id, recipient,
    selected_document.language, selected_document.document_type,
    'manual:' || selected_document.id::text || ':' || recipient, 'manual', (select auth.uid()), now()
  ) on conflict (organization_id, idempotency_key) do update set
    status = case when public.message_deliveries.status = 'failed' and public.message_deliveries.attempt_count < 3
      then 'pending' else public.message_deliveries.status end,
    next_attempt_at = case when public.message_deliveries.status = 'failed' and public.message_deliveries.attempt_count < 3
      then now() else public.message_deliveries.next_attempt_at end,
    updated_at = now()
  returning id into delivery_id;
  return delivery_id;
end;
$$;

create or replace function public.record_financial_delivery_failure_system(target_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare selected_delivery public.message_deliveries%rowtype; selected_document public.financial_documents%rowtype; system_actor uuid;
begin
  select * into selected_delivery from public.message_deliveries where id = target_delivery_id;
  if selected_delivery.id is null or selected_delivery.status <> 'failed' or selected_delivery.attempt_count < 3 then
    raise exception 'delivery_failure_not_final' using errcode = '23514';
  end if;
  select * into selected_document from public.financial_documents where id = selected_delivery.document_id;
  select coalesce(selected_delivery.requested_by, selected_document.created_by, o.created_by) into system_actor
  from public.organizations o where o.id = selected_delivery.organization_id;
  insert into private.domain_events (
    organization_id, event_type, aggregate_type, aggregate_id, actor_user_id, payload
  ) values (
    selected_delivery.organization_id, 'MESSAGE_DELIVERY_FAILED', 'message_delivery', selected_delivery.id,
    system_actor, jsonb_build_object('document_id', selected_delivery.document_id,
      'channel', selected_delivery.channel, 'attempt_count', selected_delivery.attempt_count,
      'error_code', selected_delivery.last_error_code)
  ) on conflict (event_type, aggregate_id) do nothing;
  perform private.notify_authorized_members(
    selected_delivery.organization_id, 'receipt.view', 'delivery_failed',
    'delivery_failed:' || selected_delivery.id::text, 'delivery_failed',
    jsonb_build_object('delivery_id', selected_delivery.id, 'error_code', selected_delivery.last_error_code),
    selected_delivery.document_id, selected_delivery.tenant_id, selected_document.lease_id
  );
  return selected_delivery.id;
end;
$$;

create or replace function public.mark_notification_read(target_notification_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare changed_id uuid;
begin
  update public.notifications set read_at = coalesce(read_at, now())
  where id = target_notification_id and recipient_user_id = (select auth.uid())
    and (select private.has_capability(organization_id, required_capability))
  returning id into changed_id;
  if changed_id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return changed_id;
end;
$$;

create or replace function private.can_access_financial_document_path(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.financial_documents d
    where d.organization_id::text = (storage.foldername(object_name))[1]
      and d.id::text = (storage.foldername(object_name))[2]
      and object_name = d.organization_id::text || '/' || d.id::text || '/v1.pdf'
      and (select private.has_capability(d.organization_id,
        case when d.document_type in ('payment_receipt', 'rent_receipt') then 'receipt.view' else 'due.view' end))
  );
$$;

alter table private.domain_events drop constraint domain_events_event_type_check;
alter table private.domain_events drop constraint domain_events_aggregate_type_check;
alter table private.domain_events add constraint domain_events_event_type_check check (event_type in (
  'PROPERTY_CREATED', 'TENANT_CREATED', 'LEASE_ACTIVATED', 'LEASE_LEDGER_OPENED', 'DUE_GENERATED', 'DUE_ADJUSTED',
  'PAYMENT_RECORDED', 'PAYMENT_COMPLETED', 'PAYMENT_ALLOCATION_CONFIRMED', 'PAYMENT_REVERSED',
  'DOCUMENT_GENERATED', 'DOCUMENT_INVALIDATED', 'MESSAGE_DELIVERY_FAILED'
));
alter table private.domain_events add constraint domain_events_aggregate_type_check check (aggregate_type in (
  'property', 'tenant', 'lease', 'due', 'payment', 'financial_document', 'message_delivery'
));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('financial-documents', 'financial-documents', false, 5242880, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['application/pdf'];

create policy "authorized members read private financial documents"
on storage.objects for select to authenticated
using (bucket_id = 'financial-documents' and (select private.can_access_financial_document_path(name)));

create policy "authorized members create private financial documents"
on storage.objects for insert to authenticated
with check (bucket_id = 'financial-documents' and (select private.can_access_financial_document_path(name)));

do $$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'kjora-generate-dues-daily';
  if existing_job_id is not null then
    perform cron.alter_job(existing_job_id, command => 'select private.run_financial_daily(current_date);');
  end if;
end;
$$;

revoke all on function private.document_snapshot_for_due(uuid) from public, anon, authenticated;
revoke all on function private.set_financial_document_reference() from public, anon, authenticated;
revoke all on function private.notify_authorized_members(uuid, text, text, text, text, jsonb, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.queue_automatic_delivery(uuid) from public, anon, authenticated;
revoke all on function private.prepare_payment_documents(uuid) from public, anon, authenticated;
revoke all on function private.invalidate_payment_documents(uuid, text) from public, anon, authenticated;
revoke all on function private.process_financial_document_events(integer) from public, anon, authenticated;
revoke all on function private.protect_financial_document() from public, anon, authenticated;
revoke all on function private.prepare_financial_communications(date) from public, anon, authenticated;
revoke all on function private.run_financial_daily(date) from public, anon, authenticated;
revoke all on function private.can_access_financial_document_path(text) from public, anon;
grant execute on function private.can_access_financial_document_path(text) to authenticated;
grant execute on function private.process_financial_document_events(integer) to service_role;

revoke all on function public.prepare_account_statement(uuid, date, date) from public, anon;
revoke all on function public.finalize_financial_document(uuid, text, text, bigint) from public, anon;
revoke all on function public.finalize_financial_document_system(uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function public.queue_financial_document_email(uuid) from public, anon;
revoke all on function public.record_financial_delivery_failure_system(uuid) from public, anon, authenticated;
revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.prepare_account_statement(uuid, date, date) to authenticated;
grant execute on function public.finalize_financial_document(uuid, text, text, bigint) to authenticated;
grant execute on function public.finalize_financial_document_system(uuid, text, text, bigint) to service_role;
grant execute on function public.queue_financial_document_email(uuid) to authenticated;
grant execute on function public.record_financial_delivery_failure_system(uuid) to service_role;
grant execute on function public.mark_notification_read(uuid) to authenticated;

revoke all on public.organization_communication_settings, public.financial_documents,
  public.financial_document_payments, public.message_deliveries, public.notifications
  from public, anon, authenticated;
grant select on public.organization_communication_settings, public.financial_documents,
  public.financial_document_payments, public.message_deliveries, public.notifications to authenticated;
grant update (due_notice_email_enabled, overdue_reminder_email_enabled, payment_receipt_email_enabled,
  rent_receipt_email_enabled, updated_by, updated_at) on public.organization_communication_settings to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, update on public.message_deliveries to service_role;
revoke all on sequence public.financial_document_reference_sequence from public, anon, authenticated;

comment on table public.financial_documents is
  'Lot 6C3: immutable document snapshots; private PDF materialization is versioned and invalidation never deletes originals.';
comment on table public.message_deliveries is
  'Lot 6C3: idempotent email outbox and controlled delivery history. Automatic switches default to false.';
comment on table public.notifications is
  'Lot 6C3: tenant-scoped internal notifications addressed to an authorized member and capability checked at read time.';
comment on function private.run_financial_daily(date) is
  'Lot 6C3: preserves the single daily cron, generating Dues then same-day notices/reminders without backfill or email activation.';
