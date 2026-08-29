-- Patch UX post-6C3: immediate, tenant-scoped and idempotent Payment receipt preparation.
-- This migration does not alter Payments, allocations, Ledger balances, email settings or portal access.

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
    'linked_due_total_xaf', coalesce((
      select sum(linked.net_expected_amount_xaf)
      from (
        select distinct ds.id, ds.net_expected_amount_xaf
        from public.payment_allocations a
        join public.dues_with_status ds on ds.organization_id = a.organization_id and ds.id = a.due_id
        where a.organization_id = p.organization_id and a.payment_id = p.id
      ) linked
    ), 0),
    'credit_applied_xaf', coalesce((
      select sum(linked.credit_applied_xaf)
      from (
        select distinct ds.id,
          (ds.covered_by_opening_credit_xaf + ds.covered_by_payment_credit_xaf)::bigint as credit_applied_xaf
        from public.payment_allocations a
        join public.dues_with_status ds on ds.organization_id = a.organization_id and ds.id = a.due_id
        where a.organization_id = p.organization_id and a.payment_id = p.id
      ) linked
    ), 0),
    'linked_due_remaining_xaf', coalesce((
      select sum(linked.remaining_amount_xaf)
      from (
        select distinct ds.id, ds.remaining_amount_xaf
        from public.payment_allocations a
        join public.dues_with_status ds on ds.organization_id = a.organization_id and ds.id = a.due_id
        where a.organization_id = p.organization_id and a.payment_id = p.id
      ) linked
    ), 0),
    'allocations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'due_reference', d.reference,
        'due_kind', d.kind,
        'period_start', d.period_start,
        'period_end', d.period_end,
        'due_total_xaf', ds.net_expected_amount_xaf,
        'credit_applied_xaf', ds.covered_by_opening_credit_xaf + ds.covered_by_payment_credit_xaf,
        'payment_received_xaf', a.amount_xaf,
        'remaining_xaf', ds.remaining_amount_xaf,
        'amount_xaf', a.amount_xaf,
        'rent_xaf', a.rent_amount_xaf,
        'recurring_charges_xaf', a.recurring_charges_amount_xaf,
        'deposit_xaf', a.deposit_amount_xaf
      ) order by d.due_date, d.id), '[]'::jsonb)
      from public.payment_allocations a
      join public.dues d on d.organization_id = a.organization_id and d.id = a.due_id
      join public.dues_with_status ds on ds.organization_id = d.organization_id and ds.id = d.id
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

create or replace function public.prepare_payment_receipt(target_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_payment public.payments%rowtype;
  receipt_id uuid;
begin
  if current_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  select * into selected_payment from public.payments where id = target_payment_id;
  if selected_payment.id is null
    or not (select private.has_capability(selected_payment.organization_id, 'receipt.view')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if selected_payment.status <> 'confirmed' then
    raise exception 'payment_receipt_unavailable' using errcode = '23514';
  end if;

  perform private.prepare_payment_documents(selected_payment.id);
  select d.id into receipt_id
  from public.financial_documents d
  where d.organization_id = selected_payment.organization_id
    and d.source_key = 'payment_receipt:' || selected_payment.id::text
  limit 1;
  if receipt_id is null then
    raise exception 'payment_receipt_unavailable' using errcode = '23514';
  end if;
  return receipt_id;
end;
$$;

revoke all on function public.prepare_payment_receipt(uuid) from public, anon;
grant execute on function public.prepare_payment_receipt(uuid) to authenticated;

comment on function public.prepare_payment_receipt(uuid) is
  'Prepares or returns the unique receipt for a confirmed Payment after auth.uid(), Organization and receipt.view checks. Delegates to the existing 6C3 document logic; no email or portal access is enabled.';
