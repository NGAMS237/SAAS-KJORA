create extension if not exists pg_cron with schema pg_catalog;

create table public.lease_financial_terms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  lease_id uuid not null,
  effective_from date not null,
  base_rent_xaf bigint not null check (base_rent_xaf > 0),
  recurring_charges_xaf bigint not null default 0 check (recurring_charges_xaf >= 0),
  due_day smallint not null check (due_day between 1 and 28),
  generate_due_days_before smallint not null check (generate_due_days_before in (1, 2, 3, 4, 5, 7, 10)),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint lease_financial_terms_lease_tenant_fk foreign key (organization_id, lease_id)
    references public.leases (organization_id, id) on delete restrict,
  constraint lease_financial_terms_effective_key unique (organization_id, lease_id, effective_from)
);

create table public.dues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  lease_id uuid not null,
  tenant_id uuid not null,
  kind text not null check (kind in ('periodic', 'initial_prorata', 'deposit', 'adjustment')),
  generation_key text not null check (char_length(generation_key) between 8 and 180),
  reference text not null check (char_length(reference) between 3 and 180),
  period_start date not null,
  period_end date not null,
  due_date date not null,
  notice_date date not null,
  generated_at timestamptz not null default now(),
  rent_amount_xaf bigint not null default 0 check (rent_amount_xaf >= 0),
  recurring_charges_amount_xaf bigint not null default 0 check (recurring_charges_amount_xaf >= 0),
  deposit_amount_xaf bigint not null default 0 check (deposit_amount_xaf >= 0),
  adjustment_amount_xaf bigint not null default 0 check (adjustment_amount_xaf >= 0),
  adjustment_direction text check (adjustment_direction is null or adjustment_direction in ('debit', 'credit')),
  adjusted_due_id uuid,
  expected_amount_xaf bigint generated always as (
    rent_amount_xaf + recurring_charges_amount_xaf + deposit_amount_xaf + adjustment_amount_xaf
  ) stored,
  calculation jsonb not null default '{}'::jsonb,
  cancelled_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint dues_organization_id_id_key unique (organization_id, id),
  constraint dues_lease_tenant_fk foreign key (organization_id, lease_id)
    references public.leases (organization_id, id) on delete restrict,
  constraint dues_tenant_tenant_fk foreign key (organization_id, tenant_id)
    references public.tenants (organization_id, id) on delete restrict,
  constraint dues_generation_key unique (organization_id, lease_id, generation_key),
  constraint dues_period_valid check (period_end >= period_start),
  constraint dues_amount_positive check (
    rent_amount_xaf + recurring_charges_amount_xaf + deposit_amount_xaf + adjustment_amount_xaf > 0
  ),
  constraint dues_kind_amount_consistent check (
    (kind = 'deposit' and deposit_amount_xaf > 0 and rent_amount_xaf = 0 and recurring_charges_amount_xaf = 0 and adjustment_amount_xaf = 0)
    or (kind in ('periodic', 'initial_prorata') and deposit_amount_xaf = 0 and adjustment_amount_xaf = 0 and rent_amount_xaf + recurring_charges_amount_xaf > 0)
    or (kind = 'adjustment' and adjustment_amount_xaf > 0 and rent_amount_xaf = 0 and recurring_charges_amount_xaf = 0 and deposit_amount_xaf = 0)
  ),
  constraint dues_adjustment_consistent check (
    (kind = 'adjustment' and adjustment_direction is not null and adjusted_due_id is not null)
    or (kind <> 'adjustment' and adjustment_direction is null and adjusted_due_id is null)
  )
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  lease_id uuid not null,
  tenant_id uuid not null,
  due_id uuid,
  entry_type text not null check (entry_type in ('rent', 'recurring_charge', 'initial_prorata', 'deposit', 'adjustment', 'opening_credit')),
  source_key text not null check (char_length(source_key) between 8 and 220),
  reference text not null check (char_length(reference) between 3 and 180),
  description_code text not null check (char_length(description_code) between 3 and 100),
  occurred_on date not null,
  period_start date,
  period_end date,
  debit_xaf bigint not null default 0 check (debit_xaf >= 0),
  credit_xaf bigint not null default 0 check (credit_xaf >= 0),
  sort_order smallint not null default 50,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ledger_entries_lease_tenant_fk foreign key (organization_id, lease_id)
    references public.leases (organization_id, id) on delete restrict,
  constraint ledger_entries_tenant_tenant_fk foreign key (organization_id, tenant_id)
    references public.tenants (organization_id, id) on delete restrict,
  constraint ledger_entries_due_tenant_fk foreign key (organization_id, due_id)
    references public.dues (organization_id, id) on delete restrict,
  constraint ledger_entries_source_key unique (organization_id, lease_id, source_key),
  constraint ledger_entries_one_side check (
    (debit_xaf > 0 and credit_xaf = 0) or (credit_xaf > 0 and debit_xaf = 0)
  ),
  constraint ledger_entries_period_pair check ((period_start is null) = (period_end is null)),
  constraint ledger_entries_period_valid check (period_end is null or period_end >= period_start)
);

alter table public.dues add constraint dues_adjusted_due_tenant_fk
  foreign key (organization_id, adjusted_due_id)
  references public.dues (organization_id, id) on delete restrict;

create index lease_financial_terms_lease_effective_idx
  on public.lease_financial_terms (organization_id, lease_id, effective_from desc);
create index lease_financial_terms_created_by_idx on public.lease_financial_terms (created_by) where created_by is not null;
create index dues_lease_due_date_idx on public.dues (organization_id, lease_id, due_date, period_start);
create index dues_tenant_due_date_idx on public.dues (organization_id, tenant_id, due_date, period_start);
create index dues_created_by_idx on public.dues (created_by) where created_by is not null;
create index dues_adjusted_due_idx on public.dues (organization_id, adjusted_due_id) where adjusted_due_id is not null;
create index ledger_entries_lease_order_idx
  on public.ledger_entries (organization_id, lease_id, occurred_on, sort_order, created_at, id);
create index ledger_entries_tenant_order_idx
  on public.ledger_entries (organization_id, tenant_id, occurred_on, sort_order, created_at, id);
create index ledger_entries_due_idx on public.ledger_entries (organization_id, due_id) where due_id is not null;

alter table private.domain_events drop constraint domain_events_event_type_check;
alter table private.domain_events drop constraint domain_events_aggregate_type_check;
alter table private.domain_events add constraint domain_events_event_type_check
  check (event_type in (
    'PROPERTY_CREATED', 'TENANT_CREATED', 'LEASE_ACTIVATED',
    'LEASE_LEDGER_OPENED', 'DUE_GENERATED', 'DUE_ADJUSTED'
  ));
alter table private.domain_events add constraint domain_events_aggregate_type_check
  check (aggregate_type in ('property', 'tenant', 'lease', 'due'));

alter table public.lease_financial_terms enable row level security;
alter table public.dues enable row level security;
alter table public.ledger_entries enable row level security;

create policy "authorized members read lease financial terms"
on public.lease_financial_terms for select to authenticated
using ((select private.has_capability(organization_id, 'due.view')));

create policy "authorized members read dues"
on public.dues for select to authenticated
using ((select private.has_capability(organization_id, 'due.view')));

create policy "authorized members read ledger"
on public.ledger_entries for select to authenticated
using ((select private.has_capability(organization_id, 'due.view')));

create or replace function private.reject_financial_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'financial_history_is_append_only' using errcode = '23514';
end;
$$;

create or replace function private.protect_due_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and current_setting('kjora.financial_maintenance', true) = 'cancel_future_due'
    and old.cancelled_at is null
    and new.cancelled_at is not null then
    return new;
  end if;
  raise exception 'financial_history_is_append_only' using errcode = '23514';
end;
$$;

create trigger lease_financial_terms_no_update_delete
before update or delete on public.lease_financial_terms
for each row execute function private.reject_financial_history_mutation();

create trigger dues_no_update_delete
before update or delete on public.dues
for each row execute function private.protect_due_history();

create trigger ledger_entries_no_update_delete
before update or delete on public.ledger_entries
for each row execute function private.reject_financial_history_mutation();

create or replace function private.record_due_financial_entries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rent_amount_xaf > 0 then
    insert into public.ledger_entries (
      organization_id, lease_id, tenant_id, due_id, entry_type, source_key,
      reference, description_code, occurred_on, period_start, period_end,
      debit_xaf, sort_order, metadata
    ) values (
      new.organization_id, new.lease_id, new.tenant_id, new.id,
      case when new.kind = 'initial_prorata' then 'initial_prorata' else 'rent' end,
      new.generation_key || ':rent', new.reference,
      case when new.kind = 'initial_prorata' then 'initial_prorata_rent' else 'period_rent' end,
      new.due_date, new.period_start, new.period_end, new.rent_amount_xaf, 20, new.calculation
    ) on conflict (organization_id, lease_id, source_key) do nothing;
  end if;

  if new.recurring_charges_amount_xaf > 0 then
    insert into public.ledger_entries (
      organization_id, lease_id, tenant_id, due_id, entry_type, source_key,
      reference, description_code, occurred_on, period_start, period_end,
      debit_xaf, sort_order, metadata
    ) values (
      new.organization_id, new.lease_id, new.tenant_id, new.id,
      'recurring_charge', new.generation_key || ':charges', new.reference,
      case when new.kind = 'initial_prorata' then 'initial_prorata_recurring_charges' else 'period_recurring_charges' end,
      new.due_date, new.period_start, new.period_end,
      new.recurring_charges_amount_xaf, 30, new.calculation
    ) on conflict (organization_id, lease_id, source_key) do nothing;
  end if;

  if new.deposit_amount_xaf > 0 then
    insert into public.ledger_entries (
      organization_id, lease_id, tenant_id, due_id, entry_type, source_key,
      reference, description_code, occurred_on, period_start, period_end,
      debit_xaf, sort_order, metadata
    ) values (
      new.organization_id, new.lease_id, new.tenant_id, new.id,
      'deposit', new.generation_key || ':deposit', new.reference,
      'security_deposit_due', new.due_date, new.period_start, new.period_end,
      new.deposit_amount_xaf, 90, new.calculation
    ) on conflict (organization_id, lease_id, source_key) do nothing;
  end if;

  if new.adjustment_amount_xaf > 0 then
    insert into public.ledger_entries (
      organization_id, lease_id, tenant_id, due_id, entry_type, source_key,
      reference, description_code, occurred_on, period_start, period_end,
      debit_xaf, credit_xaf, sort_order, metadata
    ) values (
      new.organization_id, new.lease_id, new.tenant_id, new.id,
      'adjustment', new.generation_key || ':adjustment', new.reference,
      'due_adjustment', new.due_date, new.period_start, new.period_end,
      case when new.adjustment_direction = 'debit' then new.adjustment_amount_xaf else 0 end,
      case when new.adjustment_direction = 'credit' then new.adjustment_amount_xaf else 0 end,
      80, new.calculation
    ) on conflict (organization_id, lease_id, source_key) do nothing;
  end if;

  insert into private.domain_events (
    organization_id, event_type, aggregate_type, aggregate_id, actor_user_id, payload
  ) values (
    new.organization_id,
    case when new.kind = 'adjustment' then 'DUE_ADJUSTED' else 'DUE_GENERATED' end,
    'due', new.id, new.created_by,
    jsonb_build_object(
      'due_id', new.id, 'lease_id', new.lease_id, 'tenant_id', new.tenant_id,
      'kind', new.kind, 'period_start', new.period_start, 'period_end', new.period_end,
      'due_date', new.due_date, 'expected_amount_xaf', new.expected_amount_xaf
    )
  ) on conflict (event_type, aggregate_id) do nothing;

  return new;
end;
$$;

create trigger dues_record_financial_entries
after insert on public.dues
for each row execute function private.record_due_financial_entries();

create or replace function private.open_lease_financial_ledger(target_lease_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_lease public.leases%rowtype;
begin
  select * into selected_lease from public.leases where id = target_lease_id;
  if not found or selected_lease.status not in ('active', 'ended') then
    return;
  end if;

  insert into public.lease_financial_terms (
    organization_id, lease_id, effective_from, base_rent_xaf,
    recurring_charges_xaf, due_day, generate_due_days_before, created_by
  ) values (
    selected_lease.organization_id, selected_lease.id, selected_lease.start_date,
    selected_lease.base_rent_xaf, selected_lease.recurring_charges_xaf,
    selected_lease.due_day, selected_lease.generate_due_days_before, selected_lease.created_by
  ) on conflict (organization_id, lease_id, effective_from) do nothing;

  if selected_lease.initial_prepayment_amount_xaf > 0 then
    insert into public.ledger_entries (
      organization_id, lease_id, tenant_id, entry_type, source_key,
      reference, description_code, occurred_on, credit_xaf, sort_order, metadata
    ) values (
      selected_lease.organization_id, selected_lease.id, selected_lease.tenant_id,
      'opening_credit', 'lease:' || selected_lease.id::text || ':opening-credit',
      'OPEN-' || left(selected_lease.id::text, 8), 'validated_lease_opening_prepayment',
      selected_lease.start_date, selected_lease.initial_prepayment_amount_xaf, 10,
      jsonb_build_object(
        'source', 'leases.initial_prepayment_amount_xaf',
        'captured_at_activation', true,
        'is_payment', false
      )
    ) on conflict (organization_id, lease_id, source_key) do nothing;
  end if;

  if selected_lease.security_deposit_xaf > 0 then
    insert into public.dues (
      organization_id, lease_id, tenant_id, kind, generation_key, reference,
      period_start, period_end, due_date, notice_date, deposit_amount_xaf,
      calculation, created_by
    ) values (
      selected_lease.organization_id, selected_lease.id, selected_lease.tenant_id,
      'deposit', 'deposit:' || selected_lease.start_date::text,
      'DEP-' || to_char(selected_lease.start_date, 'YYYYMMDD'),
      selected_lease.start_date, selected_lease.start_date,
      selected_lease.start_date, selected_lease.start_date,
      selected_lease.security_deposit_xaf,
      jsonb_build_object('separate_from_periodic_rent', true), selected_lease.created_by
    ) on conflict (organization_id, lease_id, generation_key) do nothing;
  end if;

  insert into private.domain_events (
    organization_id, event_type, aggregate_type, aggregate_id, actor_user_id, payload
  ) values (
    selected_lease.organization_id, 'LEASE_LEDGER_OPENED', 'lease', selected_lease.id,
    selected_lease.created_by,
    jsonb_build_object(
      'lease_id', selected_lease.id,
      'opening_credit_source', 'leases.initial_prepayment_amount_xaf',
      'opening_credit_xaf', selected_lease.initial_prepayment_amount_xaf
    )
  ) on conflict (event_type, aggregate_id) do nothing;
end;
$$;

create or replace function private.generate_lease_dues(target_lease_id uuid, run_on date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_lease public.leases%rowtype;
  selected_terms public.lease_financial_terms%rowtype;
  frequency_months integer;
  period_index integer := 0;
  forced_period_count integer := 0;
  scheduled_start date;
  scheduled_end date;
  actual_start date;
  actual_end date;
  lease_effective_end date;
  calculated_due_date date;
  calculated_notice_date date;
  full_days integer;
  occupied_days integer;
  calculated_rent bigint;
  calculated_charges bigint;
  override_total bigint;
  total_before_override bigint;
  due_kind text;
  inserted_id uuid;
  existing_due_id uuid;
  existing_expected_xaf bigint;
  adjustment_difference_xaf bigint;
  adjustment_direction_value text;
  inserted_count integer := 0;
begin
  select * into selected_lease from public.leases where id = target_lease_id;
  if not found or selected_lease.status not in ('active', 'ended') then
    return 0;
  end if;

  perform private.open_lease_financial_ledger(selected_lease.id);
  frequency_months := case selected_lease.billing_frequency
    when 'monthly' then 1 when 'quarterly' then 3 when 'semiannual' then 6 else 12 end;
  lease_effective_end := case when selected_lease.status = 'ended'
    then selected_lease.ended_on else selected_lease.end_date end;

  if selected_lease.initial_prepayment_amount_xaf > 0 then
    forced_period_count := floor(
      selected_lease.initial_prepayment_amount_xaf::numeric
      / greatest(selected_lease.periodic_total_xaf, 1)
    )::integer + 1;
  end if;

  loop
    exit when period_index >= 240;
    scheduled_start := (date_trunc('month', selected_lease.start_date)::date
      + make_interval(months => period_index * frequency_months))::date;
    scheduled_end := (scheduled_start + make_interval(months => frequency_months) - interval '1 day')::date;
    exit when lease_effective_end is not null and scheduled_start > lease_effective_end;

    actual_start := greatest(scheduled_start, selected_lease.start_date);
    actual_end := least(scheduled_end, coalesce(lease_effective_end, scheduled_end));

    select * into selected_terms
    from public.lease_financial_terms
    where organization_id = selected_lease.organization_id
      and lease_id = selected_lease.id
      and effective_from <= actual_start
    order by effective_from desc
    limit 1;

    if not found then
      raise exception 'lease_financial_terms_missing' using errcode = '23514';
    end if;

    calculated_due_date := make_date(
      extract(year from scheduled_start)::integer,
      extract(month from scheduled_start)::integer,
      least(
        selected_terms.due_day,
        extract(day from (date_trunc('month', scheduled_start) + interval '1 month - 1 day'))::integer
      )
    );
    calculated_due_date := greatest(calculated_due_date, selected_lease.start_date);
    calculated_notice_date := calculated_due_date - selected_terms.generate_due_days_before;
    exit when calculated_notice_date > run_on and period_index >= forced_period_count;

    full_days := scheduled_end - scheduled_start + 1;
    occupied_days := actual_end - actual_start + 1;
    calculated_rent := selected_terms.base_rent_xaf;
    calculated_charges := selected_terms.recurring_charges_xaf;
    due_kind := 'periodic';

    if actual_start > scheduled_start and selected_lease.entry_proration_mode = 'calendar_days' then
      calculated_rent := round(selected_terms.base_rent_xaf::numeric * occupied_days / full_days)::bigint;
      calculated_charges := round(selected_terms.recurring_charges_xaf::numeric * occupied_days / full_days)::bigint;
      due_kind := 'initial_prorata';
      if selected_lease.entry_proration_override_xaf is not null then
        override_total := selected_lease.entry_proration_override_xaf;
        total_before_override := selected_terms.base_rent_xaf + selected_terms.recurring_charges_xaf;
        calculated_rent := round(override_total::numeric * selected_terms.base_rent_xaf / total_before_override)::bigint;
        calculated_charges := override_total - calculated_rent;
      end if;
    end if;

    if actual_end < scheduled_end and selected_lease.exit_proration_mode = 'calendar_days' then
      calculated_rent := round(selected_terms.base_rent_xaf::numeric * occupied_days / full_days)::bigint;
      calculated_charges := round(selected_terms.recurring_charges_xaf::numeric * occupied_days / full_days)::bigint;
      if selected_lease.exit_proration_override_xaf is not null then
        override_total := selected_lease.exit_proration_override_xaf;
        total_before_override := selected_terms.base_rent_xaf + selected_terms.recurring_charges_xaf;
        calculated_rent := round(override_total::numeric * selected_terms.base_rent_xaf / total_before_override)::bigint;
        calculated_charges := override_total - calculated_rent;
      end if;
    end if;

    existing_due_id := null;
    existing_expected_xaf := null;
    select id, expected_amount_xaf into existing_due_id, existing_expected_xaf
    from public.dues
    where organization_id = selected_lease.organization_id
      and lease_id = selected_lease.id
      and generation_key = 'period:' || scheduled_start::text;

    if existing_due_id is not null
      and actual_end < scheduled_end
      and selected_lease.exit_proration_mode = 'calendar_days'
      and existing_expected_xaf <> calculated_rent + calculated_charges then
      adjustment_difference_xaf := abs(existing_expected_xaf - calculated_rent - calculated_charges);
      adjustment_direction_value := case
        when existing_expected_xaf > calculated_rent + calculated_charges then 'credit'
        else 'debit' end;
      insert into public.dues (
        organization_id, lease_id, tenant_id, kind, generation_key, reference,
        period_start, period_end, due_date, notice_date, adjustment_amount_xaf,
        adjustment_direction, adjusted_due_id, calculation, created_by
      ) values (
        selected_lease.organization_id, selected_lease.id, selected_lease.tenant_id,
        'adjustment', 'exit-adjustment:' || scheduled_start::text,
        'ADJ-' || to_char(scheduled_start, 'YYYYMMDD'),
        actual_start, actual_end, greatest(calculated_due_date, actual_end),
        greatest(calculated_due_date, actual_end), adjustment_difference_xaf,
        adjustment_direction_value, existing_due_id,
        jsonb_build_object(
          'reason', 'exit_proration',
          'original_expected_xaf', existing_expected_xaf,
          'adjusted_expected_xaf', calculated_rent + calculated_charges,
          'occupied_days', occupied_days,
          'days_in_period', full_days,
          'rounding', 'nearest_xaf_per_component'
        ), selected_lease.created_by
      ) on conflict (organization_id, lease_id, generation_key) do nothing
      returning id into inserted_id;
      if inserted_id is not null then inserted_count := inserted_count + 1; end if;
      period_index := period_index + 1;
      continue;
    end if;

    inserted_id := null;
    insert into public.dues (
      organization_id, lease_id, tenant_id, kind, generation_key, reference,
      period_start, period_end, due_date, notice_date,
      rent_amount_xaf, recurring_charges_amount_xaf, calculation, created_by
    ) values (
      selected_lease.organization_id, selected_lease.id, selected_lease.tenant_id,
      due_kind, 'period:' || scheduled_start::text,
      'DUE-' || to_char(scheduled_start, 'YYYYMMDD'),
      actual_start, actual_end, calculated_due_date, calculated_notice_date,
      calculated_rent, calculated_charges,
      jsonb_build_object(
        'scheduled_period_start', scheduled_start,
        'scheduled_period_end', scheduled_end,
        'actual_start', actual_start,
        'actual_end', actual_end,
        'occupied_days', occupied_days,
        'days_in_period', full_days,
        'base_rent_xaf', selected_terms.base_rent_xaf,
        'recurring_charges_xaf', selected_terms.recurring_charges_xaf,
        'entry_prorata', actual_start > scheduled_start and selected_lease.entry_proration_mode = 'calendar_days',
        'exit_prorata', actual_end < scheduled_end and selected_lease.exit_proration_mode = 'calendar_days',
        'terms_effective_from', selected_terms.effective_from,
        'rounding', 'nearest_xaf_per_component'
      ),
      selected_lease.created_by
    ) on conflict (organization_id, lease_id, generation_key) do nothing
    returning id into inserted_id;

    if inserted_id is not null then
      inserted_count := inserted_count + 1;
    end if;
    period_index := period_index + 1;
  end loop;

  return inserted_count;
end;
$$;

create or replace function private.cancel_lease_future_dues(target_lease_id uuid, effective_end date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_due public.dues%rowtype;
  cancelled_count integer := 0;
begin
  for selected_due in
    select * from public.dues
    where lease_id = target_lease_id
      and kind in ('periodic', 'initial_prorata')
      and period_start > effective_end
      and cancelled_at is null
    order by period_start, id
  loop
    insert into public.dues (
      organization_id, lease_id, tenant_id, kind, generation_key, reference,
      period_start, period_end, due_date, notice_date, adjustment_amount_xaf,
      adjustment_direction, adjusted_due_id, calculation, created_by
    ) values (
      selected_due.organization_id, selected_due.lease_id, selected_due.tenant_id,
      'adjustment', 'end-cancellation:' || selected_due.id::text,
      'CAN-' || left(selected_due.id::text, 8),
      selected_due.period_start, selected_due.period_end, selected_due.due_date, effective_end,
      selected_due.expected_amount_xaf, 'credit', selected_due.id,
      jsonb_build_object(
        'reason', 'lease_ended_before_period',
        'effective_end', effective_end,
        'cancelled_due_id', selected_due.id,
        'original_expected_xaf', selected_due.expected_amount_xaf
      ), selected_due.created_by
    ) on conflict (organization_id, lease_id, generation_key) do nothing;

    perform set_config('kjora.financial_maintenance', 'cancel_future_due', true);
    update public.dues set cancelled_at = now() where id = selected_due.id;
    cancelled_count := cancelled_count + 1;
  end loop;
  return cancelled_count;
end;
$$;

create or replace function private.sync_lease_financial_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    perform private.open_lease_financial_ledger(new.id);
    perform private.generate_lease_dues(new.id, current_date);
  elsif tg_op = 'UPDATE' and new.status = 'ended' and old.status = 'active' then
    perform private.cancel_lease_future_dues(new.id, new.ended_on);
    perform private.generate_lease_dues(new.id, greatest(current_date, new.ended_on));
  end if;
  return new;
end;
$$;

create trigger leases_sync_financial_lifecycle
after insert or update of status on public.leases
for each row execute function private.sync_lease_financial_lifecycle();

create or replace function private.generate_due_schedules(run_on date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_lease record;
  generated_count integer := 0;
begin
  for selected_lease in
    select id from public.leases
    where status = 'active' and start_date <= run_on
    order by organization_id, id
  loop
    generated_count := generated_count + private.generate_lease_dues(selected_lease.id, run_on);
  end loop;
  return generated_count;
end;
$$;

create or replace function public.generate_lease_dues(target_lease_id uuid, run_on date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_organization_id uuid;
begin
  select organization_id into selected_organization_id
  from public.leases where id = target_lease_id;
  if selected_organization_id is null
    or not (select private.has_capability(selected_organization_id, 'lease.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.generate_lease_dues(target_lease_id, run_on);
end;
$$;

create or replace function public.schedule_lease_financial_terms(
  target_lease_id uuid,
  target_effective_from date,
  target_base_rent_xaf bigint,
  target_recurring_charges_xaf bigint,
  target_due_day smallint,
  target_generate_due_days_before smallint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_lease public.leases%rowtype;
  inserted_id uuid;
begin
  select * into selected_lease from public.leases where id = target_lease_id;
  if not found or selected_lease.status <> 'active'
    or not (select private.has_capability(selected_lease.organization_id, 'lease.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_effective_from <= current_date
    or target_base_rent_xaf <= 0
    or target_recurring_charges_xaf < 0
    or target_due_day not between 1 and 28
    or target_generate_due_days_before not in (1, 2, 3, 4, 5, 7, 10) then
    raise exception 'invalid_future_financial_terms' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.dues
    where organization_id = selected_lease.organization_id
      and lease_id = selected_lease.id
      and period_start >= target_effective_from
  ) then
    raise exception 'future_period_already_generated' using errcode = '23514';
  end if;

  insert into public.lease_financial_terms (
    organization_id, lease_id, effective_from, base_rent_xaf,
    recurring_charges_xaf, due_day, generate_due_days_before, created_by
  ) values (
    selected_lease.organization_id, selected_lease.id, target_effective_from,
    target_base_rent_xaf, target_recurring_charges_xaf,
    target_due_day, target_generate_due_days_before, (select auth.uid())
  ) returning id into inserted_id;
  return inserted_id;
end;
$$;

create or replace view public.dues_with_status
with (security_invoker = true)
as
with opening_credits as (
  select organization_id, lease_id, sum(credit_xaf)::bigint as opening_credit_xaf
  from public.ledger_entries
  where entry_type = 'opening_credit'
  group by organization_id, lease_id
), adjustments as (
  select organization_id, adjusted_due_id,
    coalesce(sum(case when adjustment_direction = 'debit' then adjustment_amount_xaf else 0 end), 0)::bigint as adjustment_debit_xaf,
    coalesce(sum(case when adjustment_direction = 'credit' then adjustment_amount_xaf else 0 end), 0)::bigint as adjustment_credit_xaf
  from public.dues
  where kind = 'adjustment'
  group by organization_id, adjusted_due_id
), net_dues as (
  select d.*,
    case when d.kind = 'adjustment' then 0
      else greatest(d.expected_amount_xaf + coalesce(a.adjustment_debit_xaf, 0) - coalesce(a.adjustment_credit_xaf, 0), 0)
    end::bigint as net_expected_amount_xaf
  from public.dues d
  left join adjustments a
    on a.organization_id = d.organization_id and a.adjusted_due_id = d.id
), ordered_dues as (
  select d.*,
    coalesce(o.opening_credit_xaf, 0)::bigint as opening_credit_xaf,
    coalesce(sum(case when d.cancelled_at is null then d.net_expected_amount_xaf else 0 end) over (
      partition by d.organization_id, d.lease_id
      order by case when d.kind = 'adjustment' then 3 when d.kind = 'deposit' then 2 else 1 end, d.due_date, d.period_start, d.id
      rows between unbounded preceding and 1 preceding
    ), 0)::bigint as prior_debit_xaf
  from net_dues d
  left join opening_credits o
    on o.organization_id = d.organization_id and o.lease_id = d.lease_id
), positioned as (
  select ordered_dues.*,
    case when cancelled_at is not null or kind = 'adjustment' then 0 else least(
      net_expected_amount_xaf,
      greatest(opening_credit_xaf - prior_debit_xaf, 0)
    ) end::bigint as covered_by_opening_credit_xaf
  from ordered_dues
)
select positioned.*,
  (case when cancelled_at is not null then 0
    when kind = 'adjustment' then 0
    else net_expected_amount_xaf - covered_by_opening_credit_xaf end)::bigint as remaining_amount_xaf,
  case
    when cancelled_at is not null then 'cancelled'
    when kind = 'adjustment' then 'adjusted'
    when net_expected_amount_xaf - covered_by_opening_credit_xaf = 0 then 'covered'
    when due_date > current_date then 'upcoming'
    when due_date = current_date then 'due'
    else 'overdue'
  end::text as derived_status,
  case when net_expected_amount_xaf - covered_by_opening_credit_xaf > 0 and due_date < current_date
    then due_date + 10 * (floor((current_date - due_date - 1)::numeric / 10)::integer + 1)
    else null end::date as next_reminder_date
from positioned;

create or replace view public.ledger_statement
with (security_invoker = true)
as
select le.*,
  sum(le.credit_xaf - le.debit_xaf) over (
    partition by le.organization_id, le.lease_id
    order by le.occurred_on, le.sort_order, le.created_at, le.id
    rows between unbounded preceding and current row
  )::bigint as running_balance_xaf
from public.ledger_entries le;

create or replace view public.tenant_financial_positions
with (security_invoker = true)
as
with due_rollup as (
  select organization_id, tenant_id,
    coalesce(sum(remaining_amount_xaf) filter (
      where due_date <= current_date and derived_status in ('due', 'overdue', 'adjusted')
    ), 0)::bigint as amount_due_xaf,
    count(*) filter (where kind in ('periodic', 'initial_prorata') and derived_status = 'covered')::integer as covered_periods,
    max(period_end) filter (where kind in ('periodic', 'initial_prorata') and derived_status = 'covered') as last_covered_period_end,
    min(due_date) filter (
      where kind in ('periodic', 'initial_prorata') and remaining_amount_xaf > 0
    ) as next_uncovered_due_date,
    min(due_date) filter (
      where kind in ('periodic', 'initial_prorata') and due_date >= current_date
    ) as next_due_date,
    coalesce(sum(net_expected_amount_xaf) filter (
      where kind in ('periodic', 'initial_prorata') and derived_status = 'covered'
    ), 0)::bigint as fully_covered_debit_xaf
  from public.dues_with_status
  group by organization_id, tenant_id
), credit_rollup as (
  select organization_id, tenant_id,
    coalesce(sum(credit_xaf) filter (where entry_type = 'opening_credit'), 0)::bigint as opening_credit_xaf,
    max(occurred_on) as last_ledger_date
  from public.ledger_entries
  group by organization_id, tenant_id
)
select coalesce(d.organization_id, c.organization_id) as organization_id,
  coalesce(d.tenant_id, c.tenant_id) as tenant_id,
  coalesce(d.amount_due_xaf, 0)::bigint as amount_due_xaf,
  greatest(coalesce(c.opening_credit_xaf, 0) - coalesce(d.fully_covered_debit_xaf, 0), 0)::bigint as residual_opening_credit_xaf,
  coalesce(d.covered_periods, 0)::integer as covered_periods,
  d.last_covered_period_end,
  d.next_uncovered_due_date,
  d.next_due_date,
  c.last_ledger_date
from due_rollup d
full join credit_rollup c
  on c.organization_id = d.organization_id and c.tenant_id = d.tenant_id;

revoke all on function private.reject_financial_history_mutation() from public, anon, authenticated;
revoke all on function private.protect_due_history() from public, anon, authenticated;
revoke all on function private.record_due_financial_entries() from public, anon, authenticated;
revoke all on function private.open_lease_financial_ledger(uuid) from public, anon, authenticated;
revoke all on function private.generate_lease_dues(uuid, date) from public, anon, authenticated;
revoke all on function private.cancel_lease_future_dues(uuid, date) from public, anon, authenticated;
revoke all on function private.sync_lease_financial_lifecycle() from public, anon, authenticated;
revoke all on function private.generate_due_schedules(date) from public, anon, authenticated;
revoke all on function public.generate_lease_dues(uuid, date) from public, anon;
grant execute on function public.generate_lease_dues(uuid, date) to authenticated;
revoke all on function public.schedule_lease_financial_terms(uuid, date, bigint, bigint, smallint, smallint) from public, anon;
grant execute on function public.schedule_lease_financial_terms(uuid, date, bigint, bigint, smallint, smallint) to authenticated;

revoke all on table public.lease_financial_terms, public.dues, public.ledger_entries from public, anon, authenticated;
grant select on public.lease_financial_terms, public.dues, public.ledger_entries to authenticated;
revoke all on public.dues_with_status, public.ledger_statement, public.tenant_financial_positions from public, anon, authenticated;
grant select on public.dues_with_status, public.ledger_statement, public.tenant_financial_positions to authenticated;

insert into public.lease_financial_terms (
  organization_id, lease_id, effective_from, base_rent_xaf,
  recurring_charges_xaf, due_day, generate_due_days_before, created_by
)
select organization_id, id, start_date, base_rent_xaf,
  recurring_charges_xaf, due_day, generate_due_days_before, created_by
from public.leases
where status in ('active', 'ended')
on conflict (organization_id, lease_id, effective_from) do nothing;

do $$
declare
  selected_lease record;
begin
  for selected_lease in
    select id from public.leases where status in ('active', 'ended') order by organization_id, id
  loop
    perform private.open_lease_financial_ledger(selected_lease.id);
    perform private.generate_lease_dues(selected_lease.id, current_date);
  end loop;
end;
$$;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'kjora-generate-dues-daily';
  if existing_job_id is null then
    perform cron.schedule(
      'kjora-generate-dues-daily',
      '15 0 * * *',
      'select private.generate_due_schedules(current_date);'
    );
  else
    perform cron.alter_job(
      existing_job_id,
      schedule => '15 0 * * *',
      command => 'select private.generate_due_schedules(current_date);',
      active => true
    );
  end if;
end;
$$;

comment on table public.lease_financial_terms is
  'Lot 6C1: immutable effective-dated lease terms. Existing Dues keep their original snapshots.';
comment on table public.dues is
  'Lot 6C1: idempotent expected obligations with explicit rent, recurring charges, deposit and adjustment ventilation.';
comment on table public.ledger_entries is
  'Lot 6C1: append-only financial history. Positive running balance means tenant credit; negative means debt.';
comment on view public.dues_with_status is
  'Lot 6C1: derived Due coverage/status. covered is distinct from paid and never fabricates a Payment.';
comment on view public.ledger_statement is
  'Lot 6C1: readable debit/credit statement with a reproducible running balance.';
comment on view public.tenant_financial_positions is
  'Lot 6C1: tenant summary separating amount due now, residual validated opening credit and upcoming periods.';
comment on function private.generate_lease_dues(uuid, date) is
  'Lot 6C1: calendar-based, multi-frequency, proration-aware idempotent Due generator; 240-period safety cap.';
comment on table private.domain_events is
  'Internal non-localized domain facts. Lot 6C1 adds LEASE_LEDGER_OPENED, DUE_GENERATED and DUE_ADJUSTED.';
