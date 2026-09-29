-- KJORA-PILOT-EXPERIENCE-AUTONOMOUS-02
-- Deterministic, read-only month-end preview. It observes the existing due,
-- document-review and delivery queues; it never generates a due/document,
-- changes a review decision or contacts a provider.

begin;

create or replace function public.preview_africa_month_end(
  target_organization_id uuid,
  target_month date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  month_start date := date_trunc('month', coalesce(target_month, current_date))::date;
  month_end date := (date_trunc('month', coalesce(target_month, current_date)) + interval '1 month - 1 day')::date;
  rental_currency text;
  result jsonb;
begin
  if (select auth.uid()) is null
    or not (select private.has_capability(target_organization_id, 'due.view')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select p.currency_code into rental_currency
    from public.organization_profiles p
   where p.organization_id = target_organization_id;
  if rental_currency not in ('XAF','XOF','NGN','CDF','KES','ZAR') then
    raise exception 'unsupported_rental_currency' using errcode = '22023';
  end if;

  with due_scope as (
    select d.id, d.lease_id
      from public.dues d
     where d.organization_id = target_organization_id
       and d.due_date between month_start and month_end
       and d.cancelled_at is null
  ), document_scope as (
    select f.id, f.due_id, f.review_status, f.status
      from public.financial_documents f
      join due_scope d on d.id = f.due_id
     where f.organization_id = target_organization_id
       and f.document_type = 'due_notice'
       and f.status <> 'invalidated'
  ), delivery_scope as (
    select m.id, m.document_id, m.status
      from public.message_deliveries m
      join document_scope f on f.id = m.document_id
     where m.organization_id = target_organization_id
  )
  select jsonb_build_object(
    'mode', 'dry_run', 'monthStart', month_start, 'monthEnd', month_end,
    'currency', rental_currency, 'conversionApplied', false,
    'leasesSelected', (select count(distinct lease_id) from due_scope),
    'duesSelected', (select count(*) from due_scope),
    'documentsPrepared', (select count(*) from document_scope),
    'documentsMissing', greatest((select count(*) from due_scope) - (select count(distinct due_id) from document_scope), 0),
    'awaitingApproval', (select count(*) from document_scope where review_status = 'draft'),
    'deferred', (select count(*) from document_scope where review_status = 'deferred'),
    'approved', (select count(*) from document_scope where review_status = 'approved'),
    'queued', (select count(*) from delivery_scope where status in ('pending','processing')),
    'sent', (select count(*) from delivery_scope where status in ('sent','delivered'))
  ) into result;
  return result;
end;
$$;

revoke all on function public.preview_africa_month_end(uuid,date) from public, anon;
grant execute on function public.preview_africa_month_end(uuid,date) to authenticated;

comment on function public.preview_africa_month_end(uuid,date) is
  'Read-only deterministic month-end preview; no generation, conversion, provider call or entitlement change.';

commit;
