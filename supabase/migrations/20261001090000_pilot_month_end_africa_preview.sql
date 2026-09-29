-- KJORA-PILOT-EXPERIENCE-AUTONOMOUS-02
-- Deterministic, read-only month-end preview. It observes the existing due,
-- document-review and delivery queues; it never generates a due/document,
-- changes a review decision or contacts a provider.

begin;

create or replace function public.preview_africa_month_end(
  target_organization_id uuid,
  target_month date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  rental_currency text;
  organization_timezone text;
  reference_date date;
  month_start date;
  month_end date;
  result jsonb;
begin
  if (select auth.uid()) is null
    or not (select private.has_capability(target_organization_id, 'due.view')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select p.currency_code, p.timezone
    into rental_currency, organization_timezone
    from public.organization_profiles p
   where p.organization_id = target_organization_id;

  if not found then
    raise exception 'organization_profile_required' using errcode = '22023';
  end if;
  if rental_currency is null then
    raise exception 'organization_currency_required' using errcode = '22023';
  end if;
  if rental_currency not in ('XAF','XOF','NGN','CDF','KES','ZAR') then
    raise exception 'unsupported_rental_currency' using errcode = '22023';
  end if;
  if organization_timezone is null or btrim(organization_timezone) = '' then
    raise exception 'organization_timezone_required' using errcode = '22023';
  end if;
  if not exists (
    select 1
      from pg_catalog.pg_timezone_names timezone_name
     where timezone_name.name = organization_timezone
  ) then
    raise exception 'invalid_organization_timezone' using errcode = '22023';
  end if;

  reference_date := coalesce(
    target_month,
    (current_timestamp at time zone organization_timezone)::date
  );
  month_start := date_trunc('month', reference_date)::date;
  month_end := (date_trunc('month', reference_date) + interval '1 month - 1 day')::date;

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
