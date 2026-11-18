-- Arrangement avec un locataire : « Modifier le montant à payer » d'UNE échéance (remise, geste, majoration).
-- - Rien n'est effacé ni modifié : un ajustement (débit ou crédit) tracé, avec motif obligatoire, est ajouté
--   à l'échéance, comme le fait déjà « Corriger le loyer » (registre en ajout seul).
-- - Le bail, le loyer mensuel et les autres échéances ne changent pas.
-- - Le nouveau total ne peut pas être inférieur à ce qui est déjà payé ou couvert par un crédit sur l'échéance.
-- - Un aperçu (dry run) calcule tout sans rien écrire.
begin;

create or replace function public.adjust_due_amount(
  target_due_id uuid,
  target_new_total_xaf bigint,
  target_reason text,
  target_dry_run boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.dues_with_status%rowtype;
  actor uuid := (select auth.uid());
  clean_reason text := nullif(btrim(coalesce(target_reason, '')), '');
  paid bigint;
  diff bigint;
begin
  select * into d from public.dues_with_status where id = target_due_id;
  if actor is null or d.id is null or not private.has_capability(d.organization_id, 'lease.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations where id = d.organization_id and status = 'active') then
    raise exception 'organization_unavailable' using errcode = '42501';
  end if;
  if d.cancelled_at is not null or d.kind not in ('periodic', 'initial_prorata') then
    raise exception 'due_not_adjustable' using errcode = '22023';
  end if;
  if target_new_total_xaf is null or target_new_total_xaf <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if clean_reason is null or char_length(clean_reason) < 3 or char_length(clean_reason) > 300 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  paid := d.payment_allocated_xaf + d.covered_by_payment_credit_xaf;
  if target_new_total_xaf < paid then
    raise exception 'amount_below_paid' using errcode = '22023', detail = d.reference;
  end if;
  diff := target_new_total_xaf - d.net_expected_amount_xaf;
  if diff = 0 then
    raise exception 'no_change' using errcode = '22023';
  end if;

  if not target_dry_run then
    insert into public.dues (
      organization_id, lease_id, tenant_id, kind, generation_key, reference,
      period_start, period_end, due_date, notice_date,
      adjustment_amount_xaf, adjustment_direction, adjusted_due_id, calculation, created_by
    ) values (
      d.organization_id, d.lease_id, d.tenant_id, 'adjustment',
      'amount-adjustment:' || d.id::text || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'),
      'AJU-' || d.reference,
      d.period_start, d.period_end, d.due_date, d.notice_date,
      abs(diff), case when diff > 0 then 'debit' else 'credit' end, d.id,
      jsonb_build_object(
        'reason', 'due_amount_adjustment', 'is_payment', false, 'note', clean_reason,
        'old_total_xaf', d.net_expected_amount_xaf, 'new_total_xaf', target_new_total_xaf
      ),
      actor
    );
  end if;

  return jsonb_build_object(
    'dryRun', target_dry_run,
    'reference', d.reference, 'dueDate', d.due_date,
    'oldTotalXaf', d.net_expected_amount_xaf, 'newTotalXaf', target_new_total_xaf,
    'diffXaf', diff, 'paidXaf', paid,
    'remainingBeforeXaf', d.remaining_amount_xaf,
    'remainingAfterXaf', greatest(d.remaining_amount_xaf + diff, 0)
  );
end;
$$;

revoke all on function public.adjust_due_amount(uuid, bigint, text, boolean) from public, anon;
grant execute on function public.adjust_due_amount(uuid, bigint, text, boolean) to authenticated;

commit;
