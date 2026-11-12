-- Fiche bailleur unique : civilité, cachet (généré, image importée ou aucun) et où l'apposer.
-- La sauvegarde alimente aussi les réglages du cachet des contrats (plus de double saisie).
begin;

alter table public.organization_document_settings
  add column if not exists civility text check (civility is null or civility in ('M.', 'Mme')),
  add column if not exists stamp_mode text not null default 'generated' check (stamp_mode in ('generated', 'image', 'none')),
  add column if not exists stamp_data_url text check (stamp_data_url is null or (stamp_data_url ~ '^data:image/(png|jpeg);base64,' and char_length(stamp_data_url) <= 700000)),
  add column if not exists stamp_on_contracts boolean not null default true,
  add column if not exists stamp_on_receipts boolean not null default false,
  add column if not exists stamp_on_notices boolean not null default false;

create or replace function private.bounded_text(value text, min_len integer, max_len integer)
returns text language sql immutable set search_path = '' as $$
  select case when value is not null and char_length(trim(value)) between min_len and max_len then trim(value) else null end;
$$;

create or replace function public.save_organization_document_settings(
  target_organization_id uuid,
  target_settings jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rep text := nullif(trim(target_settings->>'representative'), '');
  first_part text;
  last_part text;
  civ text := case when target_settings->>'civility' in ('M.', 'Mme') then target_settings->>'civility' else null end;
  mode text := case when target_settings->>'stampMode' in ('generated', 'image', 'none') then target_settings->>'stampMode' else 'generated' end;
  on_contracts boolean := coalesce((target_settings->>'stampOnContracts')::boolean, true);
begin
  if (select auth.uid()) is null or not (select private.is_organization_owner(target_organization_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations where id = target_organization_id and status = 'active') then
    raise exception 'organization_unavailable' using errcode = '42501';
  end if;

  insert into public.organization_document_settings as s (
    organization_id, display_name, representative, phone, email, address,
    payment_instructions, notice_footer, receipt_footer, logo_data_url, signature_data_url,
    civility, stamp_mode, stamp_data_url, stamp_on_contracts, stamp_on_receipts, stamp_on_notices,
    updated_at, updated_by
  ) values (
    target_organization_id,
    nullif(trim(target_settings->>'displayName'), ''),
    rep,
    nullif(trim(target_settings->>'phone'), ''),
    nullif(lower(trim(target_settings->>'email')), ''),
    nullif(trim(target_settings->>'address'), ''),
    nullif(trim(target_settings->>'paymentInstructions'), ''),
    nullif(trim(target_settings->>'noticeFooter'), ''),
    nullif(trim(target_settings->>'receiptFooter'), ''),
    nullif(target_settings->>'logoDataUrl', ''),
    nullif(target_settings->>'signatureDataUrl', ''),
    civ, mode, nullif(target_settings->>'stampDataUrl', ''),
    on_contracts,
    coalesce((target_settings->>'stampOnReceipts')::boolean, false),
    coalesce((target_settings->>'stampOnNotices')::boolean, false),
    now(), (select auth.uid())
  )
  on conflict (organization_id) do update set
    display_name = excluded.display_name, representative = excluded.representative,
    phone = excluded.phone, email = excluded.email, address = excluded.address,
    payment_instructions = excluded.payment_instructions, notice_footer = excluded.notice_footer,
    receipt_footer = excluded.receipt_footer, logo_data_url = excluded.logo_data_url,
    signature_data_url = excluded.signature_data_url, civility = excluded.civility,
    stamp_mode = excluded.stamp_mode, stamp_data_url = excluded.stamp_data_url,
    stamp_on_contracts = excluded.stamp_on_contracts, stamp_on_receipts = excluded.stamp_on_receipts,
    stamp_on_notices = excluded.stamp_on_notices, updated_at = now(), updated_by = (select auth.uid());

  -- Cachet des contrats : alimenté par la même fiche (les contrats déjà générés gardent leur cachet figé).
  first_part := nullif(split_part(coalesce(rep, ''), ' ', 1), '');
  last_part := nullif(trim(substr(coalesce(rep, ''), char_length(coalesce(first_part, '')) + 1)), '');
  insert into public.organization_contract_settings as c (
    organization_id, stamp_enabled, stamp_name, stamp_company, stamp_phone, stamp_short_address,
    stamp_civility, stamp_first_name, stamp_last_name, updated_by, updated_at
  ) values (
    target_organization_id, mode <> 'none' and on_contracts,
    private.bounded_text(rep, 2, 120),
    private.bounded_text(target_settings->>'displayName', 2, 120),
    private.bounded_text(target_settings->>'phone', 6, 32),
    private.bounded_text(target_settings->>'address', 2, 180),
    civ, private.bounded_text(first_part, 1, 80), private.bounded_text(last_part, 1, 80),
    (select auth.uid()), now()
  )
  on conflict (organization_id) do update set
    stamp_enabled = excluded.stamp_enabled, stamp_name = coalesce(excluded.stamp_name, c.stamp_name),
    stamp_company = coalesce(excluded.stamp_company, c.stamp_company), stamp_phone = coalesce(excluded.stamp_phone, c.stamp_phone),
    stamp_short_address = coalesce(excluded.stamp_short_address, c.stamp_short_address),
    stamp_civility = coalesce(excluded.stamp_civility, c.stamp_civility),
    stamp_first_name = coalesce(excluded.stamp_first_name, c.stamp_first_name),
    stamp_last_name = coalesce(excluded.stamp_last_name, c.stamp_last_name),
    updated_by = excluded.updated_by, updated_at = now();
end;
$$;

revoke all on function public.save_organization_document_settings(uuid, jsonb) from public, anon;
grant execute on function public.save_organization_document_settings(uuid, jsonb) to authenticated;

-- Le contexte de rendu des documents expose aussi le cachet.
create or replace function private.document_branding_json(settings public.organization_document_settings)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'displayName', settings.display_name, 'representative', settings.representative,
    'civility', settings.civility, 'phone', settings.phone, 'email', settings.email, 'address', settings.address,
    'paymentInstructions', settings.payment_instructions, 'noticeFooter', settings.notice_footer,
    'receiptFooter', settings.receipt_footer, 'logoDataUrl', settings.logo_data_url,
    'signatureDataUrl', settings.signature_data_url, 'stampMode', settings.stamp_mode,
    'stampDataUrl', settings.stamp_data_url, 'stampOnContracts', settings.stamp_on_contracts,
    'stampOnReceipts', settings.stamp_on_receipts, 'stampOnNotices', settings.stamp_on_notices
  );
$$;

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
  settings public.organization_document_settings%rowtype;
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
    'branding', case when settings.organization_id is null then null else private.document_branding_json(settings) end
  );
end;
$$;


revoke all on function public.get_document_render_context(uuid, uuid) from public, anon;
grant execute on function public.get_document_render_context(uuid, uuid) to authenticated, service_role;

-- Logo, signature et cachet importé pour le PDF d'un contrat (membre ou locataire du bail).
create or replace function public.get_contract_render_branding(
  target_contract_id uuid,
  target_portal_access_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
  settings public.organization_document_settings%rowtype;
begin
  select id, organization_id, lease_id into c from public.lease_contracts where id = target_contract_id;
  if c.id is null then raise exception 'not_found' using errcode = '42501'; end if;
  if not (
    coalesce((select auth.role()), '') = 'service_role'
    or (select private.is_active_member(c.organization_id))
    or (target_portal_access_id is not null and (select private.has_tenant_portal_lease_access(target_portal_access_id, c.lease_id)))
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into settings from public.organization_document_settings where organization_id = c.organization_id;
  return case when settings.organization_id is null then null else private.document_branding_json(settings) end;
end;
$$;

revoke all on function public.get_contract_render_branding(uuid, uuid) from public, anon;
grant execute on function public.get_contract_render_branding(uuid, uuid) to authenticated, service_role;

commit;
