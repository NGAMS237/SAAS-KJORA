-- Refonte des documents : informations du bailleur (en-tête, logo, signature, moyens de paiement)
-- et contexte de rendu des avis / quittances / reçus (civilité, arriéré à la date d'édition).
begin;

create table if not exists public.organization_document_settings (
  organization_id uuid primary key references public.organizations (id) on delete restrict,
  display_name text check (display_name is null or char_length(display_name) between 1 and 120),
  representative text check (representative is null or char_length(representative) <= 120),
  phone text check (phone is null or char_length(phone) <= 40),
  email text check (email is null or char_length(email) <= 160),
  address text check (address is null or char_length(address) <= 240),
  payment_instructions text check (payment_instructions is null or char_length(payment_instructions) <= 500),
  notice_footer text check (notice_footer is null or char_length(notice_footer) <= 300),
  receipt_footer text check (receipt_footer is null or char_length(receipt_footer) <= 300),
  logo_data_url text check (logo_data_url is null or (logo_data_url ~ '^data:image/(png|jpeg);base64,' and char_length(logo_data_url) <= 700000)),
  signature_data_url text check (signature_data_url is null or (signature_data_url ~ '^data:image/(png|jpeg);base64,' and char_length(signature_data_url) <= 700000)),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

alter table public.organization_document_settings enable row level security;

drop policy if exists "members can read document settings" on public.organization_document_settings;
create policy "members can read document settings"
on public.organization_document_settings for select to authenticated
using ((select private.is_active_member(organization_id)));

revoke all on public.organization_document_settings from anon, authenticated;
grant select on public.organization_document_settings to authenticated;

-- Écriture réservée au propriétaire de l'Organization active.
create or replace function public.save_organization_document_settings(
  target_organization_id uuid,
  target_settings jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean text;
begin
  if (select auth.uid()) is null or not (select private.is_organization_owner(target_organization_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations where id = target_organization_id and status = 'active') then
    raise exception 'organization_unavailable' using errcode = '42501';
  end if;
  insert into public.organization_document_settings as s (
    organization_id, display_name, representative, phone, email, address,
    payment_instructions, notice_footer, receipt_footer, logo_data_url, signature_data_url, updated_at, updated_by
  ) values (
    target_organization_id,
    nullif(trim(target_settings->>'displayName'), ''),
    nullif(trim(target_settings->>'representative'), ''),
    nullif(trim(target_settings->>'phone'), ''),
    nullif(lower(trim(target_settings->>'email')), ''),
    nullif(trim(target_settings->>'address'), ''),
    nullif(trim(target_settings->>'paymentInstructions'), ''),
    nullif(trim(target_settings->>'noticeFooter'), ''),
    nullif(trim(target_settings->>'receiptFooter'), ''),
    nullif(target_settings->>'logoDataUrl', ''),
    nullif(target_settings->>'signatureDataUrl', ''),
    now(), (select auth.uid())
  )
  on conflict (organization_id) do update set
    display_name = excluded.display_name, representative = excluded.representative,
    phone = excluded.phone, email = excluded.email, address = excluded.address,
    payment_instructions = excluded.payment_instructions, notice_footer = excluded.notice_footer,
    receipt_footer = excluded.receipt_footer, logo_data_url = excluded.logo_data_url,
    signature_data_url = excluded.signature_data_url, updated_at = now(), updated_by = (select auth.uid());
end;
$$;

revoke all on function public.save_organization_document_settings(uuid, jsonb) from public, anon;
grant execute on function public.save_organization_document_settings(uuid, jsonb) to authenticated;

-- Contexte de rendu d'un document : lisible par un membre de l'Organization, par le locataire
-- (accès portail actif sur la location du document) ou par le service d'envoi.
create or replace function public.get_document_render_context(
  target_document_id uuid,
  target_portal_access_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d record;
  tenant record;
  settings record;
  due_date_ref date;
  arrears bigint := 0;
begin
  select id, organization_id, tenant_id, lease_id, due_id, document_type, issued_on
    into d from public.financial_documents where id = target_document_id;
  if d.id is null then
    raise exception 'not_found' using errcode = '42501';
  end if;
  if not (
    coalesce((select auth.role()), '') = 'service_role'
    or (select private.is_active_member(d.organization_id))
    or (target_portal_access_id is not null and d.lease_id is not null
        and (select private.has_tenant_portal_lease_access(target_portal_access_id, d.lease_id)))
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select civility, full_name into tenant from public.tenants
    where organization_id = d.organization_id and id = d.tenant_id;
  select * into settings from public.organization_document_settings where organization_id = d.organization_id;

  if d.document_type = 'due_notice' and d.due_id is not null and d.lease_id is not null then
    select due_date into due_date_ref from public.dues where id = d.due_id;
    select coalesce(sum(greatest(remaining_amount_xaf, 0)), 0) into arrears
      from public.dues_with_status
      where organization_id = d.organization_id and lease_id = d.lease_id
        and id <> d.due_id and cancelled_at is null and kind <> 'adjustment'
        and due_date < coalesce(due_date_ref, d.issued_on);
  end if;

  return jsonb_build_object(
    'tenantCivility', tenant.civility,
    'arrearsXaf', arrears,
    'branding', case when settings.organization_id is null then null else jsonb_build_object(
      'displayName', settings.display_name, 'representative', settings.representative,
      'phone', settings.phone, 'email', settings.email, 'address', settings.address,
      'paymentInstructions', settings.payment_instructions, 'noticeFooter', settings.notice_footer,
      'receiptFooter', settings.receipt_footer, 'logoDataUrl', settings.logo_data_url,
      'signatureDataUrl', settings.signature_data_url
    ) end
  );
end;
$$;

revoke all on function public.get_document_render_context(uuid, uuid) from public, anon;
grant execute on function public.get_document_render_context(uuid, uuid) to authenticated, service_role;

commit;
