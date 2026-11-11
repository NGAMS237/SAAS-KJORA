-- Correction du loyer d'un bail actif : « Corriger le loyer ».
-- - Le loyer et les charges du bail se corrigent tout de suite (le garde-fou d'immuabilité laisse passer
--   uniquement cette fonction, via un indicateur local à la transaction).
-- - Les échéances FUTURES (pas encore émises) utilisent les nouveaux montants : une nouvelle ligne de
--   conditions financières est ajoutée à partir de la première période non émise.
-- - Les échéances DÉJÀ émises ne sont jamais modifiées : si on le demande, elles sont corrigées par des
--   « ajustements » (débit ou crédit) tracés, comme le prévoit déjà le registre (historique en ajout seul).
-- - Un aperçu (dry run) calcule tout sans rien écrire.
begin;

create or replace function private.enforce_lease_invariants()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  selected_tenant boolean;
  selected_property boolean;
  selected_unit boolean;
begin
  select exists (
    select 1 from public.tenants t
    where t.organization_id = new.organization_id and t.id = new.tenant_id
  ) into selected_tenant;
  select exists (
    select 1 from public.properties p
    where p.organization_id = new.organization_id and p.id = new.property_id and p.status = 'active'
  ) into selected_property;
  select exists (
    select 1 from public.units u
    where u.organization_id = new.organization_id
      and u.property_id = new.property_id
      and u.id = new.unit_id
      and u.status = 'active'
  ) into selected_unit;

  if not selected_tenant then
    raise exception 'tenant_unavailable' using errcode = '23503';
  end if;
  if not selected_property or not selected_unit then
    raise exception 'unit_unavailable' using errcode = '23503';
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'active' and new.activated_at is null then
      new.activated_at := now();
    elsif new.status <> 'draft' then
      raise exception 'lease_must_start_draft' using errcode = '23514';
    end if;
  else
    if new.organization_id <> old.organization_id
      or new.property_id <> old.property_id
      or new.unit_id <> old.unit_id
      or new.tenant_id <> old.tenant_id
      or new.created_by <> old.created_by then
      raise exception 'lease_relationship_immutable' using errcode = '23514';
    end if;
    if old.status = 'ended' then
      raise exception 'lease_ended_immutable' using errcode = '23514';
    end if;
    if old.status = 'active' and new.status not in ('active', 'ended') then
      raise exception 'lease_invalid_transition' using errcode = '23514';
    end if;
    if old.status = 'draft' and new.status = 'ended' then
      raise exception 'lease_invalid_transition' using errcode = '23514';
    end if;
    if old.status = 'active' and (
      new.start_date <> old.start_date
      or new.end_date is distinct from old.end_date
      or (
        coalesce(current_setting('kjora.financial_maintenance', true), '') <> 'correct_lease_rent'
        and (new.base_rent_xaf <> old.base_rent_xaf or new.recurring_charges_xaf <> old.recurring_charges_xaf)
      )
      or new.security_deposit_xaf <> old.security_deposit_xaf
      or new.initial_prepayment_periods <> old.initial_prepayment_periods
      or new.initial_prepayment_amount_xaf <> old.initial_prepayment_amount_xaf
      or new.billing_frequency <> old.billing_frequency
      or new.due_day <> old.due_day
      or new.generate_due_days_before <> old.generate_due_days_before
      or new.overdue_reminder_days_after <> old.overdue_reminder_days_after
      or new.entry_proration_mode <> old.entry_proration_mode
      or new.exit_proration_mode <> old.exit_proration_mode
      or new.entry_proration_override_xaf is distinct from old.entry_proration_override_xaf
      or new.entry_proration_override_reason is distinct from old.entry_proration_override_reason
      or new.exit_proration_override_xaf is distinct from old.exit_proration_override_xaf
      or new.exit_proration_override_reason is distinct from old.exit_proration_override_reason
    ) then
      raise exception 'active_lease_terms_immutable' using errcode = '23514';
    end if;
    if old.status = 'draft' and new.status = 'active' then
      new.activated_at := now();
    end if;
    if old.status = 'active' and new.status = 'ended' then
      new.ended_at := now();
      new.ended_on := coalesce(new.ended_on, current_date);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.correct_lease_rent(
  target_lease_id uuid,
  target_base_rent_xaf bigint,
  target_recurring_charges_xaf bigint,
  target_apply_to_open_dues boolean default false,
  target_from_date date default null,
  target_dry_run boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leases%rowtype;
  actor uuid := (select auth.uid());
  d record;
  ratio numeric;
  new_rent bigint;
  new_charges bigint;
  new_total bigint;
  diff bigint;
  paid bigint;
  changed integer := 0;
  sum_diff bigint := 0;
  remaining_before bigint := 0;
  next_from date;
  changes jsonb := '[]'::jsonb;
  from_date date;
begin
  select * into l from public.leases where id = target_lease_id;
  if actor is null or l.id is null or not private.has_capability(l.organization_id, 'lease.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations where id = l.organization_id and status = 'active') then
    raise exception 'organization_unavailable' using errcode = '42501';
  end if;
  if l.status <> 'active' then
    raise exception 'lease_not_active' using errcode = '22023';
  end if;
  if target_base_rent_xaf is null or target_base_rent_xaf <= 0
    or target_recurring_charges_xaf is null or target_recurring_charges_xaf < 0 then
    raise exception 'invalid_rent_amounts' using errcode = '22023';
  end if;

  from_date := coalesce(target_from_date, l.start_date);
  next_from := coalesce(
    (select max(period_end) from public.dues
      where organization_id = l.organization_id and lease_id = l.id
        and kind in ('periodic', 'initial_prorata') and cancelled_at is null) + 1,
    l.start_date
  );
  if exists (
    select 1 from public.lease_financial_terms
    where organization_id = l.organization_id and lease_id = l.id and effective_from >= next_from
  ) then
    raise exception 'scheduled_change_exists' using errcode = '23505';
  end if;

  select coalesce(sum(remaining_amount_xaf), 0) into remaining_before
  from public.dues_with_status
  where organization_id = l.organization_id and lease_id = l.id and cancelled_at is null and kind <> 'adjustment';

  if target_apply_to_open_dues then
    for d in
      select * from public.dues_with_status
      where organization_id = l.organization_id and lease_id = l.id
        and kind in ('periodic', 'initial_prorata') and cancelled_at is null
        and period_start >= from_date
      order by due_date, period_start
    loop
      ratio := case
        when (d.calculation->>'days_in_period') ~ '^[0-9]+$' and (d.calculation->>'occupied_days') ~ '^[0-9]+$'
          and (d.calculation->>'days_in_period')::integer > 0
        then (d.calculation->>'occupied_days')::numeric / (d.calculation->>'days_in_period')::numeric
        when d.kind = 'periodic' then 1
        else null
      end;
      -- Prorata sans calcul exploitable (ex. montant saisi à la main) : on n'y touche pas.
      continue when ratio is null;
      new_rent := round(target_base_rent_xaf * ratio);
      new_charges := round(target_recurring_charges_xaf * ratio);
      new_total := new_rent + new_charges;
      diff := new_total - d.net_expected_amount_xaf;
      continue when diff = 0;
      paid := d.payment_allocated_xaf + d.covered_by_payment_credit_xaf;
      if new_total <= 0 or new_total < paid then
        raise exception 'correction_below_paid' using errcode = '22023', detail = d.reference;
      end if;
      changed := changed + 1;
      sum_diff := sum_diff + diff;
      changes := changes || jsonb_build_array(jsonb_build_object(
        'reference', d.reference, 'dueDate', d.due_date,
        'oldTotalXaf', d.net_expected_amount_xaf, 'newTotalXaf', new_total
      ));
      if not target_dry_run then
        insert into public.dues (
          organization_id, lease_id, tenant_id, kind, generation_key, reference,
          period_start, period_end, due_date, notice_date,
          adjustment_amount_xaf, adjustment_direction, adjusted_due_id, calculation, created_by
        ) values (
          l.organization_id, l.id, l.tenant_id, 'adjustment',
          'rent-correction:' || d.id::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'),
          'COR-' || d.reference,
          d.period_start, d.period_end, d.due_date, d.notice_date,
          abs(diff), case when diff > 0 then 'debit' else 'credit' end, d.id,
          jsonb_build_object(
            'reason', 'rent_correction', 'is_payment', false,
            'old_total_xaf', d.net_expected_amount_xaf, 'new_total_xaf', new_total,
            'new_base_rent_xaf', target_base_rent_xaf, 'new_recurring_charges_xaf', target_recurring_charges_xaf
          ),
          actor
        );
      end if;
    end loop;
  end if;

  if not target_dry_run then
    perform set_config('kjora.financial_maintenance', 'correct_lease_rent', true);
    update public.leases
    set base_rent_xaf = target_base_rent_xaf, recurring_charges_xaf = target_recurring_charges_xaf
    where id = l.id;
    perform set_config('kjora.financial_maintenance', '', true);

    insert into public.lease_financial_terms (
      organization_id, lease_id, effective_from, base_rent_xaf, recurring_charges_xaf,
      due_day, generate_due_days_before, created_by
    ) values (
      l.organization_id, l.id, next_from, target_base_rent_xaf, target_recurring_charges_xaf,
      least(l.due_day, 28), l.generate_due_days_before, actor
    );
  end if;

  return jsonb_build_object(
    'dryRun', target_dry_run,
    'oldBaseRentXaf', l.base_rent_xaf, 'oldRecurringChargesXaf', l.recurring_charges_xaf,
    'newBaseRentXaf', target_base_rent_xaf, 'newRecurringChargesXaf', target_recurring_charges_xaf,
    'futureDuesFrom', next_from,
    'adjustedDues', changed,
    'remainingBeforeXaf', remaining_before,
    'remainingAfterXaf', greatest(remaining_before + sum_diff, 0),
    'changes', changes
  );
end;
$$;

revoke all on function public.correct_lease_rent(uuid, bigint, bigint, boolean, date, boolean) from public, anon;
grant execute on function public.correct_lease_rent(uuid, bigint, bigint, boolean, date, boolean) to authenticated;

commit;
