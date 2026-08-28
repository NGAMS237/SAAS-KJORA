-- LOT 6C2 — real payments, explicit allocations, tenant credit and reversals.
-- No Payment is backfilled: existing opening credits remain Ledger credits from 6C1.

alter table public.role_capabilities
  drop constraint role_capabilities_capability_check;

alter table public.role_capabilities
  add constraint role_capabilities_capability_check check (capability in (
    'organization.view', 'organization.profile.manage',
    'member.view', 'member.manage',
    'property.view', 'property.manage',
    'unit.view', 'unit.manage',
    'tenant.view', 'tenant.manage',
    'lease.view', 'lease.manage',
    'due.view', 'payment.view', 'payment.record', 'payment.correct', 'payment.correction.request',
    'receipt.view', 'receipt.share', 'activity.view', 'audit.view',
    'tenant_portal.manage'
  ));

insert into public.role_capabilities (role, capability)
values ('organization_owner', 'payment.correct')
on conflict (role, capability) do nothing;

create sequence public.payment_reference_sequence as bigint;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  tenant_id uuid not null,
  lease_id uuid not null,
  reference_sequence bigint not null default nextval('public.payment_reference_sequence'),
  reference text not null check (reference ~ '^PAY-[0-9]{4}-[0-9]{6,}$'),
  amount_xaf bigint not null check (amount_xaf > 0),
  currency text not null default 'XAF' check (currency = 'XAF'),
  payment_date date not null check (payment_date >= date '2000-01-01'),
  method text not null check (method in ('cash', 'mtn_momo', 'orange_money', 'bank_transfer', 'other')),
  external_reference text check (external_reference is null or char_length(external_reference) between 1 and 160),
  note text check (note is null or char_length(note) between 1 and 2000),
  allocation_mode text not null check (allocation_mode in ('automatic', 'manual')),
  status text not null default 'recorded' check (status in ('recorded', 'confirmed', 'reversed')),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 200),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  balance_before_xaf bigint not null,
  balance_after_xaf bigint not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  reversed_by uuid references auth.users (id),
  reversed_at timestamptz,
  reversal_reason text check (reversal_reason is null or char_length(reversal_reason) between 3 and 500),
  constraint payments_organization_id_id_key unique (organization_id, id),
  constraint payments_reference_key unique (organization_id, reference),
  constraint payments_idempotency_key unique (organization_id, idempotency_key),
  constraint payments_tenant_tenant_fk foreign key (organization_id, tenant_id)
    references public.tenants (organization_id, id) on delete restrict,
  constraint payments_lease_tenant_fk foreign key (organization_id, lease_id)
    references public.leases (organization_id, id) on delete restrict,
  constraint payments_status_timestamps check (
    (status = 'recorded' and confirmed_at is null and reversed_at is null and reversed_by is null and reversal_reason is null)
    or (status = 'confirmed' and confirmed_at is not null and reversed_at is null and reversed_by is null and reversal_reason is null)
    or (status = 'reversed' and confirmed_at is not null and reversed_at is not null and reversed_by is not null and reversal_reason is not null)
  )
);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  payment_id uuid not null,
  due_id uuid not null,
  lease_id uuid not null,
  tenant_id uuid not null,
  amount_xaf bigint not null check (amount_xaf > 0),
  rent_amount_xaf bigint not null default 0 check (rent_amount_xaf >= 0),
  recurring_charges_amount_xaf bigint not null default 0 check (recurring_charges_amount_xaf >= 0),
  deposit_amount_xaf bigint not null default 0 check (deposit_amount_xaf >= 0),
  adjustment_amount_xaf bigint not null default 0 check (adjustment_amount_xaf >= 0),
  created_at timestamptz not null default now(),
  constraint payment_allocations_payment_key unique (organization_id, payment_id, due_id),
  constraint payment_allocations_payment_tenant_fk foreign key (organization_id, payment_id)
    references public.payments (organization_id, id) on delete restrict,
  constraint payment_allocations_due_tenant_fk foreign key (organization_id, due_id)
    references public.dues (organization_id, id) on delete restrict,
  constraint payment_allocations_lease_tenant_fk foreign key (organization_id, lease_id)
    references public.leases (organization_id, id) on delete restrict,
  constraint payment_allocations_tenant_tenant_fk foreign key (organization_id, tenant_id)
    references public.tenants (organization_id, id) on delete restrict,
  constraint payment_allocations_components_match check (
    amount_xaf = rent_amount_xaf + recurring_charges_amount_xaf + deposit_amount_xaf + adjustment_amount_xaf
  )
);

alter table public.ledger_entries
  add column payment_id uuid;

alter table public.ledger_entries
  add constraint ledger_entries_payment_tenant_fk foreign key (organization_id, payment_id)
    references public.payments (organization_id, id) on delete restrict;

alter table public.ledger_entries
  drop constraint ledger_entries_entry_type_check;

alter table public.ledger_entries
  add constraint ledger_entries_entry_type_check check (entry_type in (
    'rent', 'recurring_charge', 'initial_prorata', 'deposit', 'adjustment', 'opening_credit',
    'payment', 'payment_reversal'
  ));

create index payments_organization_date_idx
  on public.payments (organization_id, payment_date desc, created_at desc);
create index payments_tenant_date_idx
  on public.payments (organization_id, tenant_id, payment_date desc);
create index payments_lease_date_idx
  on public.payments (organization_id, lease_id, payment_date desc);
create index payments_method_idx
  on public.payments (organization_id, method, payment_date desc);
create index payments_status_idx
  on public.payments (organization_id, status, payment_date desc);
create index payments_created_by_idx on public.payments (created_by, created_at desc);
create index payments_reversed_by_idx on public.payments (reversed_by, reversed_at desc) where reversed_by is not null;
create index payment_allocations_due_idx
  on public.payment_allocations (organization_id, due_id, created_at);
create index payment_allocations_payment_idx
  on public.payment_allocations (organization_id, payment_id, created_at);
create index payment_allocations_lease_idx
  on public.payment_allocations (organization_id, lease_id, created_at);
create index payment_allocations_tenant_idx
  on public.payment_allocations (organization_id, tenant_id, created_at);
create index ledger_entries_payment_idx
  on public.ledger_entries (organization_id, payment_id) where payment_id is not null;

alter table private.domain_events drop constraint domain_events_event_type_check;
alter table private.domain_events drop constraint domain_events_aggregate_type_check;
alter table private.domain_events add constraint domain_events_event_type_check
  check (event_type in (
    'PROPERTY_CREATED', 'TENANT_CREATED', 'LEASE_ACTIVATED',
    'LEASE_LEDGER_OPENED', 'DUE_GENERATED', 'DUE_ADJUSTED',
    'PAYMENT_RECORDED', 'PAYMENT_COMPLETED', 'PAYMENT_ALLOCATION_CONFIRMED', 'PAYMENT_REVERSED'
  ));
alter table private.domain_events add constraint domain_events_aggregate_type_check
  check (aggregate_type in ('property', 'tenant', 'lease', 'due', 'payment'));

alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;

create policy "authorized members read payments"
on public.payments for select to authenticated
using ((select private.has_capability(organization_id, 'payment.view')));

create policy "authorized members read payment allocations"
on public.payment_allocations for select to authenticated
using ((select private.has_capability(organization_id, 'payment.view')));

create or replace function private.set_payment_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.reference := 'PAY-' || extract(year from new.payment_date)::integer::text || '-'
    || lpad(new.reference_sequence::text, 6, '0');
  return new;
end;
$$;

create trigger payments_set_reference
before insert on public.payments
for each row execute function private.set_payment_reference();

create or replace function private.protect_payment_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and current_setting('kjora.payment_maintenance', true) = 'confirm'
    and old.status = 'recorded' and new.status = 'confirmed'
    and new.confirmed_at is not null
    and to_jsonb(new) - array['status', 'confirmed_at'] = to_jsonb(old) - array['status', 'confirmed_at'] then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and current_setting('kjora.payment_maintenance', true) = 'reverse'
    and old.status = 'confirmed' and new.status = 'reversed'
    and new.reversed_at is not null and new.reversed_by is not null and new.reversal_reason is not null
    and to_jsonb(new) - array['status', 'reversed_at', 'reversed_by', 'reversal_reason']
      = to_jsonb(old) - array['status', 'reversed_at', 'reversed_by', 'reversal_reason'] then
    return new;
  end if;
  raise exception 'payment_history_is_append_only' using errcode = '23514';
end;
$$;

create trigger payments_no_update_delete
before update or delete on public.payments
for each row execute function private.protect_payment_history();

create trigger payment_allocations_no_update_delete
before update or delete on public.payment_allocations
for each row execute function private.reject_financial_history_mutation();

drop view public.tenant_financial_positions;
drop view public.dues_with_status;
drop view public.ledger_statement;

create view public.dues_with_status
with (security_invoker = true)
as
with opening_credits as (
  select organization_id, lease_id, sum(credit_xaf)::bigint as opening_credit_xaf
  from public.ledger_entries
  where entry_type = 'opening_credit'
  group by organization_id, lease_id
), confirmed_payments as (
  select organization_id, lease_id, sum(amount_xaf)::bigint as payment_credit_xaf
  from public.payments
  where status = 'confirmed'
  group by organization_id, lease_id
), confirmed_allocations as (
  select a.organization_id, a.lease_id, a.due_id,
    sum(a.amount_xaf)::bigint as payment_allocated_xaf,
    sum(a.rent_amount_xaf)::bigint as rent_paid_xaf,
    sum(a.recurring_charges_amount_xaf)::bigint as recurring_charges_paid_xaf,
    sum(a.deposit_amount_xaf)::bigint as deposit_paid_xaf,
    sum(a.adjustment_amount_xaf)::bigint as adjustment_paid_xaf
  from public.payment_allocations a
  join public.payments p
    on p.organization_id = a.organization_id and p.id = a.payment_id
  where p.status = 'confirmed'
  group by a.organization_id, a.lease_id, a.due_id
), lease_allocations as (
  select organization_id, lease_id, sum(payment_allocated_xaf)::bigint as payment_allocated_xaf
  from confirmed_allocations
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
), explicit_position as (
  select d.*,
    coalesce(o.opening_credit_xaf, 0)::bigint as opening_credit_xaf,
    coalesce(p.payment_credit_xaf, 0)::bigint as payment_credit_xaf,
    greatest(coalesce(p.payment_credit_xaf, 0) - coalesce(la.payment_allocated_xaf, 0), 0)::bigint
      as unallocated_payment_credit_xaf,
    coalesce(a.payment_allocated_xaf, 0)::bigint as payment_allocated_xaf,
    coalesce(a.rent_paid_xaf, 0)::bigint as rent_paid_xaf,
    coalesce(a.recurring_charges_paid_xaf, 0)::bigint as recurring_charges_paid_xaf,
    coalesce(a.deposit_paid_xaf, 0)::bigint as deposit_paid_xaf,
    coalesce(a.adjustment_paid_xaf, 0)::bigint as adjustment_paid_xaf,
    greatest(d.net_expected_amount_xaf - coalesce(a.payment_allocated_xaf, 0), 0)::bigint as after_explicit_xaf
  from net_dues d
  left join opening_credits o on o.organization_id = d.organization_id and o.lease_id = d.lease_id
  left join confirmed_payments p on p.organization_id = d.organization_id and p.lease_id = d.lease_id
  left join lease_allocations la on la.organization_id = d.organization_id and la.lease_id = d.lease_id
  left join confirmed_allocations a on a.organization_id = d.organization_id and a.due_id = d.id
), opening_position as (
  select e.*,
    coalesce(sum(case when e.cancelled_at is null and e.kind in ('periodic', 'initial_prorata')
      then e.after_explicit_xaf else 0 end) over (
      partition by e.organization_id, e.lease_id
      order by case when e.kind = 'adjustment' then 3 when e.kind = 'deposit' then 2 else 1 end,
        e.due_date, e.period_start, e.id
      rows between unbounded preceding and 1 preceding
    ), 0)::bigint as prior_after_explicit_xaf
  from explicit_position e
), opening_covered as (
  select o.*,
    case when o.cancelled_at is not null or o.kind not in ('periodic', 'initial_prorata') then 0 else least(
      o.after_explicit_xaf,
      greatest(o.opening_credit_xaf - o.prior_after_explicit_xaf, 0)
    ) end::bigint as covered_by_opening_credit_xaf
  from opening_position o
), payment_credit_position as (
  select o.*,
    greatest(o.after_explicit_xaf - o.covered_by_opening_credit_xaf, 0)::bigint as after_opening_xaf,
    coalesce(sum(case when o.cancelled_at is null and o.kind in ('periodic', 'initial_prorata')
      then greatest(o.after_explicit_xaf - o.covered_by_opening_credit_xaf, 0) else 0 end) over (
      partition by o.organization_id, o.lease_id
      order by case when o.kind = 'adjustment' then 3 when o.kind = 'deposit' then 2 else 1 end,
        o.due_date, o.period_start, o.id
      rows between unbounded preceding and 1 preceding
    ), 0)::bigint as prior_after_opening_xaf
  from opening_covered o
), positioned as (
  select p.*,
    case when p.cancelled_at is not null or p.kind not in ('periodic', 'initial_prorata') then 0 else least(
      p.after_opening_xaf,
      greatest(p.unallocated_payment_credit_xaf - p.prior_after_opening_xaf, 0)
    ) end::bigint as covered_by_payment_credit_xaf
  from payment_credit_position p
)
select positioned.*,
  (covered_by_opening_credit_xaf + covered_by_payment_credit_xaf)::bigint as covered_by_credit_xaf,
  case when cancelled_at is not null or kind = 'adjustment' then 0
    else greatest(after_opening_xaf - covered_by_payment_credit_xaf, 0) end::bigint as remaining_amount_xaf,
  case
    when cancelled_at is not null then 'cancelled'
    when kind = 'adjustment' then 'adjusted'
    when after_opening_xaf - covered_by_payment_credit_xaf = 0 and payment_allocated_xaf > 0 then 'paid'
    when after_opening_xaf - covered_by_payment_credit_xaf = 0 then 'covered'
    when due_date < current_date then 'overdue'
    when payment_allocated_xaf > 0 then 'partially_paid'
    when due_date = current_date then 'due'
    else 'upcoming'
  end::text as derived_status,
  case when after_opening_xaf - covered_by_payment_credit_xaf > 0 and due_date < current_date
    then due_date + 10 * (floor((current_date - due_date - 1)::numeric / 10)::integer + 1)
    else null end::date as next_reminder_date
from positioned;

create view public.ledger_statement
with (security_invoker = true)
as
select le.*,
  sum(le.credit_xaf - le.debit_xaf) over (
    partition by le.organization_id, le.lease_id
    order by le.occurred_on, le.sort_order, le.created_at, le.id
    rows between unbounded preceding and current row
  )::bigint as running_balance_xaf
from public.ledger_entries le;

create view public.tenant_financial_positions
with (security_invoker = true)
as
with due_rollup as (
  select organization_id, tenant_id,
    coalesce(sum(remaining_amount_xaf) filter (
      where due_date <= current_date and derived_status in ('due', 'overdue', 'partially_paid', 'adjusted')
    ), 0)::bigint as amount_due_xaf,
    count(*) filter (where kind in ('periodic', 'initial_prorata') and derived_status = 'covered')::integer as covered_periods,
    max(period_end) filter (where kind in ('periodic', 'initial_prorata') and derived_status = 'covered') as last_covered_period_end,
    min(due_date) filter (
      where kind in ('periodic', 'initial_prorata') and remaining_amount_xaf > 0
    ) as next_uncovered_due_date,
    min(due_date) filter (
      where kind in ('periodic', 'initial_prorata') and due_date >= current_date
    ) as next_due_date,
    coalesce(sum(covered_by_opening_credit_xaf), 0)::bigint as used_opening_credit_xaf,
    coalesce(sum(covered_by_payment_credit_xaf), 0)::bigint as used_payment_credit_xaf
  from public.dues_with_status
  group by organization_id, tenant_id
), credit_rollup as (
  select organization_id, tenant_id,
    coalesce(sum(credit_xaf) filter (where entry_type = 'opening_credit'), 0)::bigint as opening_credit_xaf,
    coalesce(sum(credit_xaf - debit_xaf), 0)::bigint as ledger_balance_xaf,
    max(occurred_on) as last_ledger_date
  from public.ledger_entries
  group by organization_id, tenant_id
), payment_rollup as (
  select organization_id, tenant_id, coalesce(sum(amount_xaf), 0)::bigint as payment_credit_xaf
  from public.payments
  where status = 'confirmed'
  group by organization_id, tenant_id
), allocation_rollup as (
  select a.organization_id, a.tenant_id, coalesce(sum(a.amount_xaf), 0)::bigint as payment_allocated_xaf
  from public.payment_allocations a
  join public.payments p on p.organization_id = a.organization_id and p.id = a.payment_id
  where p.status = 'confirmed'
  group by a.organization_id, a.tenant_id
)
select coalesce(d.organization_id, c.organization_id) as organization_id,
  coalesce(d.tenant_id, c.tenant_id) as tenant_id,
  coalesce(d.amount_due_xaf, 0)::bigint as amount_due_xaf,
  greatest(coalesce(c.opening_credit_xaf, 0) - coalesce(d.used_opening_credit_xaf, 0), 0)::bigint
    as residual_opening_credit_xaf,
  greatest(
    greatest(coalesce(p.payment_credit_xaf, 0) - coalesce(a.payment_allocated_xaf, 0), 0)
      - coalesce(d.used_payment_credit_xaf, 0), 0
  )::bigint as residual_payment_credit_xaf,
  (
    greatest(coalesce(c.opening_credit_xaf, 0) - coalesce(d.used_opening_credit_xaf, 0), 0)
    + greatest(
      greatest(coalesce(p.payment_credit_xaf, 0) - coalesce(a.payment_allocated_xaf, 0), 0)
        - coalesce(d.used_payment_credit_xaf, 0), 0
    )
  )::bigint as available_credit_xaf,
  coalesce(p.payment_credit_xaf, 0)::bigint as total_received_xaf,
  coalesce(c.ledger_balance_xaf, 0)::bigint as ledger_balance_xaf,
  coalesce(d.covered_periods, 0)::integer as covered_periods,
  d.last_covered_period_end,
  d.next_uncovered_due_date,
  d.next_due_date,
  c.last_ledger_date
from due_rollup d
full join credit_rollup c
  on c.organization_id = d.organization_id and c.tenant_id = d.tenant_id
left join allocation_rollup a
  on a.organization_id = coalesce(d.organization_id, c.organization_id)
  and a.tenant_id = coalesce(d.tenant_id, c.tenant_id)
left join payment_rollup p
  on p.organization_id = coalesce(d.organization_id, c.organization_id)
  and p.tenant_id = coalesce(d.tenant_id, c.tenant_id);

create or replace function private.allocate_payment_to_due(
  target_payment_id uuid,
  target_due_id uuid,
  target_amount_xaf bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_payment public.payments%rowtype;
  selected_due public.dues%rowtype;
  due_position record;
  paid_rent bigint := 0;
  paid_charges bigint := 0;
  paid_deposit bigint := 0;
  paid_adjustment bigint := 0;
  effective_rent bigint := 0;
  effective_charges bigint := 0;
  effective_deposit bigint := 0;
  effective_adjustment bigint := 0;
  credit_to_apply bigint := 0;
  allocation_left bigint;
  allocation_rent bigint := 0;
  allocation_charges bigint := 0;
  allocation_deposit bigint := 0;
  allocation_adjustment bigint := 0;
  available_component bigint;
begin
  select * into selected_payment from public.payments where id = target_payment_id;
  select * into selected_due from public.dues where id = target_due_id for update;
  if selected_payment.id is null or selected_payment.status <> 'recorded'
    or selected_due.id is null or selected_due.cancelled_at is not null
    or selected_due.kind = 'adjustment'
    or selected_due.organization_id <> selected_payment.organization_id
    or selected_due.lease_id <> selected_payment.lease_id
    or selected_due.tenant_id <> selected_payment.tenant_id
    or target_amount_xaf <= 0 then
    raise exception 'invalid_payment_allocation' using errcode = '23514';
  end if;

  select * into due_position from public.dues_with_status where id = target_due_id;
  if due_position.id is null or target_amount_xaf > due_position.remaining_amount_xaf then
    raise exception 'payment_allocation_exceeds_due' using errcode = '23514';
  end if;

  select
    coalesce(sum(a.rent_amount_xaf), 0),
    coalesce(sum(a.recurring_charges_amount_xaf), 0),
    coalesce(sum(a.deposit_amount_xaf), 0),
    coalesce(sum(a.adjustment_amount_xaf), 0)
  into paid_rent, paid_charges, paid_deposit, paid_adjustment
  from public.payment_allocations a
  join public.payments p on p.organization_id = a.organization_id and p.id = a.payment_id
  where a.organization_id = selected_due.organization_id
    and a.due_id = selected_due.id and p.status = 'confirmed';

  effective_rent := least(selected_due.rent_amount_xaf, due_position.net_expected_amount_xaf);
  effective_charges := least(selected_due.recurring_charges_amount_xaf,
    greatest(due_position.net_expected_amount_xaf - effective_rent, 0));
  effective_deposit := least(selected_due.deposit_amount_xaf,
    greatest(due_position.net_expected_amount_xaf - effective_rent - effective_charges, 0));
  effective_adjustment := greatest(
    due_position.net_expected_amount_xaf - effective_rent - effective_charges - effective_deposit, 0);

  credit_to_apply := due_position.covered_by_credit_xaf;
  available_component := greatest(effective_rent - paid_rent, 0);
  credit_to_apply := greatest(credit_to_apply - least(credit_to_apply, available_component), 0);
  effective_rent := greatest(available_component - due_position.covered_by_credit_xaf, 0);

  available_component := greatest(effective_charges - paid_charges, 0);
  effective_charges := greatest(available_component - credit_to_apply, 0);
  credit_to_apply := greatest(credit_to_apply - available_component, 0);

  available_component := greatest(effective_deposit - paid_deposit, 0);
  effective_deposit := greatest(available_component - credit_to_apply, 0);
  credit_to_apply := greatest(credit_to_apply - available_component, 0);

  available_component := greatest(effective_adjustment - paid_adjustment, 0);
  effective_adjustment := greatest(available_component - credit_to_apply, 0);

  allocation_left := target_amount_xaf;
  allocation_rent := least(allocation_left, effective_rent);
  allocation_left := allocation_left - allocation_rent;
  allocation_charges := least(allocation_left, effective_charges);
  allocation_left := allocation_left - allocation_charges;
  allocation_deposit := least(allocation_left, effective_deposit);
  allocation_left := allocation_left - allocation_deposit;
  allocation_adjustment := least(allocation_left, effective_adjustment);
  allocation_left := allocation_left - allocation_adjustment;
  if allocation_left <> 0 then
    raise exception 'payment_allocation_components_do_not_reconcile' using errcode = '23514';
  end if;

  insert into public.payment_allocations (
    organization_id, payment_id, due_id, lease_id, tenant_id, amount_xaf,
    rent_amount_xaf, recurring_charges_amount_xaf, deposit_amount_xaf, adjustment_amount_xaf
  ) values (
    selected_payment.organization_id, selected_payment.id, selected_due.id,
    selected_payment.lease_id, selected_payment.tenant_id, target_amount_xaf,
    allocation_rent, allocation_charges, allocation_deposit, allocation_adjustment
  );
end;
$$;

create or replace function public.confirm_payment(
  target_lease_id uuid,
  target_amount_xaf bigint,
  target_payment_date date,
  target_method text,
  target_external_reference text,
  target_note text,
  target_idempotency_key text,
  target_allocations jsonb default null
)
returns table (
  payment_id uuid,
  payment_reference text,
  allocated_amount_xaf bigint,
  credit_created_xaf bigint,
  balance_before_xaf bigint,
  balance_after_xaf bigint,
  payment_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_lease public.leases%rowtype;
  existing_payment public.payments%rowtype;
  created_payment public.payments%rowtype;
  normalized_external_reference text := nullif(trim(target_external_reference), '');
  normalized_note text := nullif(trim(target_note), '');
  normalized_idempotency_key text := trim(target_idempotency_key);
  request_hash text;
  allocated_xaf bigint := 0;
  available_xaf bigint;
  proposed_xaf bigint;
  due_item record;
  allocation_item jsonb;
  allocation_due_id uuid;
  allocation_xaf bigint;
  current_balance bigint;
begin
  if current_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  select * into selected_lease from public.leases where id = target_lease_id;
  if selected_lease.id is null
    or selected_lease.status not in ('active', 'ended')
    or not (select private.has_capability(selected_lease.organization_id, 'payment.record')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_amount_xaf is null or target_amount_xaf <= 0
    or target_payment_date is null or target_payment_date < date '2000-01-01'
    or target_payment_date > current_date
    or target_method not in ('cash', 'mtn_momo', 'orange_money', 'bank_transfer', 'other')
    or char_length(normalized_idempotency_key) not between 16 and 200
    or (normalized_external_reference is not null and char_length(normalized_external_reference) > 160)
    or (normalized_note is not null and char_length(normalized_note) > 2000) then
    raise exception 'invalid_payment' using errcode = '22023';
  end if;
  if target_allocations is not null and jsonb_typeof(target_allocations) <> 'array' then
    raise exception 'invalid_payment_allocations' using errcode = '22023';
  end if;
  if target_allocations is not null and exists (
    select 1 from (
      select value->>'due_id' as due_id, count(*)
      from jsonb_array_elements(target_allocations)
      group by value->>'due_id' having count(*) > 1
    ) duplicated
  ) then
    raise exception 'duplicate_payment_allocation' using errcode = '23505';
  end if;

  request_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'lease_id', target_lease_id,
    'amount_xaf', target_amount_xaf,
    'payment_date', target_payment_date,
    'method', target_method,
    'external_reference', normalized_external_reference,
    'note', normalized_note,
    'allocations', target_allocations
  )::text, 'utf8'), 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(selected_lease.organization_id::text || ':' || selected_lease.id::text, 0)
  );

  select * into existing_payment from public.payments
  where organization_id = selected_lease.organization_id
    and idempotency_key = normalized_idempotency_key
  for update;
  if existing_payment.id is not null then
    if existing_payment.request_fingerprint <> request_hash then
      raise exception 'idempotency_key_conflict' using errcode = '23505';
    end if;
    select coalesce(sum(a.amount_xaf), 0)::bigint into allocated_xaf
    from public.payment_allocations a where a.payment_id = existing_payment.id;
    return query select existing_payment.id, existing_payment.reference, allocated_xaf,
      existing_payment.amount_xaf - allocated_xaf,
      existing_payment.balance_before_xaf, existing_payment.balance_after_xaf,
      existing_payment.status;
    return;
  end if;

  select coalesce(sum(credit_xaf - debit_xaf), 0)::bigint into current_balance
  from public.ledger_entries
  where organization_id = selected_lease.organization_id and lease_id = selected_lease.id;

  insert into public.payments (
    organization_id, tenant_id, lease_id, reference, amount_xaf, payment_date, method,
    external_reference, note, allocation_mode, idempotency_key, request_fingerprint,
    balance_before_xaf, balance_after_xaf, created_by
  ) values (
    selected_lease.organization_id, selected_lease.tenant_id, selected_lease.id,
    'PAY-2000-000000', target_amount_xaf, target_payment_date, target_method,
    normalized_external_reference, normalized_note,
    case when target_allocations is null then 'automatic' else 'manual' end,
    normalized_idempotency_key, request_hash, current_balance, current_balance + target_amount_xaf,
    current_user_id
  ) returning * into created_payment;

  available_xaf := target_amount_xaf;
  if target_allocations is null then
    for due_item in
      select id, remaining_amount_xaf
      from public.dues_with_status
      where organization_id = selected_lease.organization_id
        and lease_id = selected_lease.id
        and kind in ('periodic', 'initial_prorata')
        and cancelled_at is null
        and due_date <= target_payment_date
        and remaining_amount_xaf > 0
      order by due_date, period_start, id
    loop
      exit when available_xaf = 0;
      proposed_xaf := least(available_xaf, due_item.remaining_amount_xaf);
      perform private.allocate_payment_to_due(created_payment.id, due_item.id, proposed_xaf);
      allocated_xaf := allocated_xaf + proposed_xaf;
      available_xaf := available_xaf - proposed_xaf;
    end loop;
  else
    for allocation_item in select value from jsonb_array_elements(target_allocations)
    loop
      if coalesce(allocation_item->>'due_id', '') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or coalesce(allocation_item->>'amount_xaf', '') !~ '^[0-9]+$' then
        raise exception 'invalid_payment_allocation' using errcode = '22023';
      end if;
      allocation_due_id := (allocation_item->>'due_id')::uuid;
      allocation_xaf := (allocation_item->>'amount_xaf')::bigint;
      if allocation_xaf <= 0 or allocation_xaf > available_xaf then
        raise exception 'payment_allocation_exceeds_payment' using errcode = '23514';
      end if;
      perform private.allocate_payment_to_due(created_payment.id, allocation_due_id, allocation_xaf);
      allocated_xaf := allocated_xaf + allocation_xaf;
      available_xaf := available_xaf - allocation_xaf;
    end loop;
  end if;

  perform set_config('kjora.payment_maintenance', 'confirm', true);
  update public.payments set status = 'confirmed', confirmed_at = now()
  where id = created_payment.id returning * into created_payment;

  insert into public.ledger_entries (
    organization_id, lease_id, tenant_id, payment_id, entry_type, source_key,
    reference, description_code, occurred_on, credit_xaf, sort_order, metadata
  ) values (
    created_payment.organization_id, created_payment.lease_id, created_payment.tenant_id,
    created_payment.id, 'payment', 'payment:' || created_payment.id::text || ':confirmed',
    created_payment.reference, 'payment_confirmed', created_payment.payment_date,
    created_payment.amount_xaf, 70,
    jsonb_build_object(
      'method', created_payment.method,
      'allocated_xaf', allocated_xaf,
      'credit_created_xaf', available_xaf,
      'external_reference_present', created_payment.external_reference is not null
    )
  );

  insert into private.domain_events (
    organization_id, event_type, aggregate_type, aggregate_id, actor_user_id, payload
  ) values
    (created_payment.organization_id, 'PAYMENT_RECORDED', 'payment', created_payment.id,
      current_user_id, jsonb_build_object('payment_id', created_payment.id, 'reference', created_payment.reference,
        'lease_id', created_payment.lease_id, 'tenant_id', created_payment.tenant_id,
        'amount_xaf', created_payment.amount_xaf, 'method', created_payment.method)),
    (created_payment.organization_id, 'PAYMENT_ALLOCATION_CONFIRMED', 'payment', created_payment.id,
      current_user_id, jsonb_build_object('payment_id', created_payment.id,
        'allocated_xaf', allocated_xaf, 'credit_created_xaf', available_xaf)),
    (created_payment.organization_id, 'PAYMENT_COMPLETED', 'payment', created_payment.id,
      current_user_id, jsonb_build_object('payment_id', created_payment.id, 'reference', created_payment.reference,
        'amount_xaf', created_payment.amount_xaf));

  return query select created_payment.id, created_payment.reference, allocated_xaf, available_xaf,
    created_payment.balance_before_xaf, created_payment.balance_after_xaf, created_payment.status;
end;
$$;

create or replace function public.reverse_payment(
  target_payment_id uuid,
  target_reason text
)
returns table (payment_id uuid, payment_reference text, payment_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_payment public.payments%rowtype;
  normalized_reason text := trim(target_reason);
begin
  if current_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  select * into selected_payment from public.payments where id = target_payment_id;
  if selected_payment.id is null
    or not (select private.has_capability(selected_payment.organization_id, 'payment.correct')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(normalized_reason) not between 3 and 500 then
    raise exception 'payment_reversal_reason_required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(selected_payment.organization_id::text || ':' || selected_payment.lease_id::text, 0)
  );
  select * into selected_payment from public.payments where id = target_payment_id for update;
  if selected_payment.status <> 'confirmed' then
    raise exception 'payment_not_reversible' using errcode = '23514';
  end if;

  perform set_config('kjora.payment_maintenance', 'reverse', true);
  update public.payments set
    status = 'reversed', reversed_by = current_user_id, reversed_at = now(),
    reversal_reason = normalized_reason
  where id = selected_payment.id returning * into selected_payment;

  insert into public.ledger_entries (
    organization_id, lease_id, tenant_id, payment_id, entry_type, source_key,
    reference, description_code, occurred_on, debit_xaf, sort_order, metadata
  ) values (
    selected_payment.organization_id, selected_payment.lease_id, selected_payment.tenant_id,
    selected_payment.id, 'payment_reversal', 'payment:' || selected_payment.id::text || ':reversal',
    selected_payment.reference || '-REV', 'payment_reversed', current_date,
    selected_payment.amount_xaf, 75,
    jsonb_build_object('original_payment_id', selected_payment.id, 'reason', normalized_reason)
  );

  insert into private.domain_events (
    organization_id, event_type, aggregate_type, aggregate_id, actor_user_id, payload
  ) values (
    selected_payment.organization_id, 'PAYMENT_REVERSED', 'payment', selected_payment.id,
    current_user_id, jsonb_build_object(
      'payment_id', selected_payment.id, 'reference', selected_payment.reference,
      'amount_xaf', selected_payment.amount_xaf, 'reason', normalized_reason
    )
  );

  return query select selected_payment.id, selected_payment.reference, selected_payment.status;
end;
$$;

revoke all on function private.set_payment_reference() from public, anon, authenticated;
revoke all on function private.protect_payment_history() from public, anon, authenticated;
revoke all on function private.allocate_payment_to_due(uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public.confirm_payment(uuid, bigint, date, text, text, text, text, jsonb) from public, anon;
revoke all on function public.reverse_payment(uuid, text) from public, anon;
grant execute on function public.confirm_payment(uuid, bigint, date, text, text, text, text, jsonb) to authenticated;
grant execute on function public.reverse_payment(uuid, text) to authenticated;

revoke all on sequence public.payment_reference_sequence from public, anon, authenticated;
revoke all on table public.payments, public.payment_allocations from public, anon, authenticated;
grant select on public.payments, public.payment_allocations to authenticated;
revoke all on public.dues_with_status, public.ledger_statement, public.tenant_financial_positions
  from public, anon, authenticated;
grant select on public.dues_with_status, public.ledger_statement, public.tenant_financial_positions
  to authenticated;

comment on table public.payments is
  'Lot 6C2: real received money. Confirmed financial fields are immutable; correction uses a compensating reversal.';
comment on table public.payment_allocations is
  'Lot 6C2: immutable allocation of one real Payment across one or more Dues of the same Lease.';
comment on function public.confirm_payment(uuid, bigint, date, text, text, text, text, jsonb) is
  'Lot 6C2: authenticated, capability-checked, idempotent and lease-serialized atomic Payment confirmation.';
comment on function public.reverse_payment(uuid, text) is
  'Lot 6C2: Owner-only compensating reversal with mandatory reason; original Payment and allocations remain preserved.';
comment on view public.dues_with_status is
  'Lot 6C2: Due remaining/status derived from explicit confirmed allocations, opening credit and surplus Payment credit.';
comment on view public.tenant_financial_positions is
  'Lot 6C2: tenant balance summary derived from Ledger, Dues and active Payment allocations; no mutable balance column.';
comment on table private.domain_events is
  'Internal non-localized domain facts. Lot 6C2 adds PAYMENT_RECORDED, PAYMENT_COMPLETED, PAYMENT_ALLOCATION_CONFIRMED and PAYMENT_REVERSED.';
