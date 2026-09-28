begin;

-- KJORA — BILLING-AFRICA-RECURRING-01
-- Complément additif au parcours manuel existant : la date réellement
-- constatée du règlement est distincte de l'instant où l'Admin le confirme.
-- Les migrations historiques restent immuables.

alter table public.billing_invoices
  add column if not exists manual_payment_received_on date;

alter table public.billing_invoices
  add constraint billing_invoices_manual_received_on_requires_paid check (
    manual_payment_received_on is null or status = 'paid'
  );

comment on column public.billing_invoices.manual_payment_received_on is
  'BILLING-AFRICA-RECURRING-01 : date métier du règlement manuel vérifiée par l''Admin. Distincte de manual_payment_confirmed_at, horodatage d''audit.';

-- La signature historique à six paramètres n'est plus exposée à
-- authenticated : elle reste présente pour préserver le replay de
-- l'historique, mais le chemin applicatif doit fournir p_received_on.
revoke execute on function public.admin_confirm_manual_invoice_payment(
  uuid, text, bigint, text, text, text
) from authenticated;

create or replace function public.admin_confirm_manual_invoice_payment(
  target_invoice_id uuid,
  p_currency text,
  p_amount_minor bigint,
  p_manual_reference text,
  p_received_on date,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.assert_platform_admin();

  if p_received_on is null or p_received_on > current_date then
    return jsonb_build_object('outcome', 'invalid_received_on');
  end if;

  result := public.admin_confirm_manual_invoice_payment(
    target_invoice_id,
    p_currency,
    p_amount_minor,
    p_manual_reference,
    p_note,
    p_idempotency_key
  );

  if result ->> 'outcome' = 'confirmed' then
    update public.billing_invoices
       set manual_payment_received_on = p_received_on,
           paid_at = p_received_on::timestamp at time zone 'UTC'
     where id = target_invoice_id
       and payment_idempotency_key = p_idempotency_key;

    result := result || jsonb_build_object('receivedOn', p_received_on);
  elsif result ->> 'outcome' = 'already_paid' then
    if not exists (
      select 1 from public.billing_invoices
       where id = target_invoice_id
         and payment_idempotency_key = p_idempotency_key
         and manual_payment_received_on is not distinct from p_received_on
    ) then
      return jsonb_build_object('outcome', 'payment_idempotency_conflict');
    end if;
  end if;

  return result;
end;
$$;

revoke all on function public.admin_confirm_manual_invoice_payment(
  uuid, text, bigint, text, date, text, text
) from public, anon;
grant execute on function public.admin_confirm_manual_invoice_payment(
  uuid, text, bigint, text, date, text, text
) to authenticated;

commit;
