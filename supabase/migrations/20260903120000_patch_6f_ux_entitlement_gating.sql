-- =============================================================================
-- PATCH-6F-UX — Entitlement gating for Lot 6F contract RPCs (ALIGN-01 wire-up)
-- Applied : 2026-09-03
-- Author  : Blaise (via PATCH-6F-UX)
--
-- Problem : Lot 6F write RPCs checked RBAC (has_capability 'contract.manage')
--           but did NOT check the ALIGN-01 plan feature 'contracts'.
--           A Découverte org owner could bypass the UI and call RPCs directly.
--
-- Fix     : Add org_has_feature() check to every write RPC.
--           Rule: RBAC authorized AND plan feature available → operation allowed.
--           Read RPCs (get_lease_contract, get_lease_contracts, list_my_tenant_portal_contracts,
--           get_my_tenant_portal_contract, get_lease_contract_signatures) are not patched —
--           they only return data for contracts that can no longer be created.
--           Tenant-side actions (sign_tenant, finalize) remain portal-access-scoped;
--           they can only act on contracts already sent, which cannot be created by Découverte.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. generate_lease_contract — RBAC + contracts feature (Essentiel+)
-- ---------------------------------------------------------------------------
create or replace function public.generate_lease_contract(target_lease_id uuid, target_template_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare selected_lease public.leases%rowtype; selected_template public.contract_templates%rowtype;
  selected_profile public.organization_profiles%rowtype; selected_tenant public.tenants%rowtype;
  selected_property public.properties%rowtype; selected_unit public.units%rowtype; selected_settings public.organization_contract_settings%rowtype;
  new_id uuid; filtered_sections jsonb;
begin
  select * into selected_lease from public.leases where id = target_lease_id;
  if selected_lease.id is null or not (select private.has_capability(selected_lease.organization_id,'contract.manage')) then
    raise exception 'not_found' using errcode = '42501';
  end if;
  -- ALIGN-01 plan feature gate (contracts = Essentiel+)
  if not (select public.org_has_feature(selected_lease.organization_id,'contracts')) then
    raise exception 'PLAN_FEATURE_NOT_AVAILABLE' using errcode='42501',
      detail=format('{"code":"PLAN_FEATURE_NOT_AVAILABLE","feature":"contracts"}');
  end if;
  select * into selected_template from public.contract_templates where id = target_template_id and status = 'active'
    and (is_system or organization_id = selected_lease.organization_id);
  if selected_template.id is null then raise exception 'invalid_template' using errcode = '22023'; end if;
  select * into selected_profile from public.organization_profiles where organization_id = selected_lease.organization_id;
  select * into selected_tenant from public.tenants where organization_id = selected_lease.organization_id and id = selected_lease.tenant_id;
  select * into selected_property from public.properties where organization_id = selected_lease.organization_id and id = selected_lease.property_id;
  select * into selected_unit from public.units where organization_id = selected_lease.organization_id and id = selected_lease.unit_id;
  select * into selected_settings from public.organization_contract_settings where organization_id = selected_lease.organization_id;
  select coalesce(jsonb_agg(section order by ordinality), '[]'::jsonb) into filtered_sections
    from jsonb_array_elements(selected_template.sections) with ordinality as item(section, ordinality)
    where section->>'condition' = 'always'
      or (section->>'condition' = 'deposit_positive' and selected_lease.security_deposit_xaf > 0)
      or (section->>'condition' = 'charges_positive' and selected_lease.recurring_charges_xaf > 0)
      or (section->>'condition' = 'initial_payment_positive' and selected_lease.initial_prepayment_amount_xaf > 0)
      or (section->>'condition' = 'end_date_present' and selected_lease.end_date is not null)
      or (section->>'condition' = 'payment_terms_present' and false);
  insert into public.lease_contracts (
    organization_id,lease_id,tenant_id,template_id,template_version,language,reference,
    template_snapshot,data_snapshot,content_snapshot,stamp_snapshot,created_by
  ) values (
    selected_lease.organization_id,selected_lease.id,selected_lease.tenant_id,selected_template.id,
    selected_template.version,selected_template.language,(select private.contract_reference(selected_lease.organization_id)),
    jsonb_build_object('id',selected_template.id,'familyKey',selected_template.family_key,'name',selected_template.name,'version',selected_template.version,'language',selected_template.language),
    jsonb_build_object(
      'organization',jsonb_build_object('id',selected_lease.organization_id,'name',selected_profile.name,'currency',selected_profile.currency_code,'country',selected_profile.country_code),
      'lessor',jsonb_build_object('displayName',coalesce(selected_settings.stamp_company,selected_profile.name),'phone',selected_settings.stamp_phone,'address',selected_settings.stamp_short_address),
      'tenant',jsonb_build_object('id',selected_tenant.id,'name',selected_tenant.full_name,'email',selected_tenant.email,'phone',selected_tenant.phone),
      'property',jsonb_build_object('id',selected_property.id,'name',selected_property.name,'locality',selected_property.locality,'type',selected_property.type),
      'unit',jsonb_build_object('id',selected_unit.id,'label',selected_unit.label,'type',selected_unit.type),
      'lease',jsonb_build_object('id',selected_lease.id,'status',selected_lease.status,'start_date',selected_lease.start_date,
        'end_date',selected_lease.end_date,'end_date_sentence',case when selected_lease.end_date is null then '' else
          case when selected_template.language='fr' then ' et se termine le ' else ' and ends on ' end || selected_lease.end_date::text end,
        'base_rent',selected_lease.base_rent_xaf,'charges',selected_lease.recurring_charges_xaf,'deposit',selected_lease.security_deposit_xaf,
        'initial_payment',selected_lease.initial_prepayment_amount_xaf,'frequency',selected_lease.billing_frequency,'due_day',selected_lease.due_day,'payment_terms','')
    ), filtered_sections,
    case when selected_settings.organization_id is null then '{}'::jsonb else jsonb_build_object(
      'enabled',selected_settings.stamp_enabled,'name',selected_settings.stamp_name,'company',selected_settings.stamp_company,
      'phone',selected_settings.stamp_phone,'address',selected_settings.stamp_short_address,'position',selected_settings.stamp_position) end,
    (select auth.uid())
  ) returning id into new_id;
  perform private.write_contract_audit(new_id,'contract.generated',jsonb_build_object('lease_id',selected_lease.id,'template_id',selected_template.id,'template_version',selected_template.version));
  return new_id;
exception when unique_violation then raise exception 'contract_already_exists' using errcode = '23505';
end; $$;

-- ---------------------------------------------------------------------------
-- 2. validate_lease_contract — RBAC + contracts feature
-- ---------------------------------------------------------------------------
create or replace function public.validate_lease_contract(target_contract_id uuid, target_content jsonb, target_sha256 text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.lease_contracts%rowtype;
begin
  select * into c from public.lease_contracts where id=target_contract_id for update;
  if c.id is null or not (select private.has_capability(c.organization_id,'contract.manage')) then raise exception 'not_found' using errcode='42501'; end if;
  if not (select public.org_has_feature(c.organization_id,'contracts')) then
    raise exception 'PLAN_FEATURE_NOT_AVAILABLE' using errcode='42501',
      detail=format('{"code":"PLAN_FEATURE_NOT_AVAILABLE","feature":"contracts"}');
  end if;
  if c.status <> 'draft' or not (select private.valid_contract_sections(target_content))
    or jsonb_array_length(target_content) <> jsonb_array_length(c.content_snapshot)
    or exists (
      select 1 from jsonb_array_elements(target_content) proposed
      where not exists (select 1 from jsonb_array_elements(c.content_snapshot) frozen
        where frozen->>'key'=proposed->>'key' and frozen->>'condition'=proposed->>'condition')
    )
    or (select count(distinct proposed->>'key') from jsonb_array_elements(target_content) proposed) <> jsonb_array_length(target_content)
    or target_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'invalid_contract_validation' using errcode='22023'; end if;
  update public.lease_contracts set content_snapshot=target_content,content_sha256=target_sha256,status='ready',validated_by=auth.uid(),validated_at=now() where id=c.id;
  perform private.write_contract_audit(c.id,'contract.validated',jsonb_build_object('content_sha256',target_sha256)); return c.id;
end; $$;

-- ---------------------------------------------------------------------------
-- 3. sign_lease_contract_owner — RBAC + contracts feature
-- ---------------------------------------------------------------------------
create or replace function public.sign_lease_contract_owner(target_contract_id uuid,target_method text,target_signature jsonb,target_consent_text text,target_sha256 text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.lease_contracts%rowtype; signature_id uuid;
begin
  select * into c from public.lease_contracts where id=target_contract_id for update;
  if c.id is null or not (select private.has_capability(c.organization_id,'contract.manage')) then raise exception 'not_found' using errcode='42501'; end if;
  if not (select public.org_has_feature(c.organization_id,'contracts')) then
    raise exception 'PLAN_FEATURE_NOT_AVAILABLE' using errcode='42501',
      detail=format('{"code":"PLAN_FEATURE_NOT_AVAILABLE","feature":"contracts"}');
  end if;
  if c.status <> 'ready' or c.content_sha256 <> target_sha256 or target_method not in ('drawn','stylized_name')
    or jsonb_typeof(target_signature)<>'object' or pg_column_size(target_signature)>100000
    or (target_method='stylized_name' and char_length(trim(coalesce(target_signature->>'displayName',''))) not between 2 and 120)
    or (target_method='drawn' and (jsonb_typeof(target_signature->'strokes')<>'array' or jsonb_array_length(target_signature->'strokes') not between 2 and 1000))
    or char_length(trim(target_consent_text)) not between 8 and 500 then raise exception 'invalid_contract_state' using errcode='22023'; end if;
  insert into public.contract_signatures (organization_id,contract_id,tenant_id,lease_id,party,signer_user_id,method,signature_data,consent_code,consent_text,content_sha256)
    values (c.organization_id,c.id,c.tenant_id,c.lease_id,'owner',auth.uid(),target_method,target_signature,'owner_contract_signature_v1',target_consent_text,target_sha256)
    returning id into signature_id;
  update public.lease_contracts set status='owner_signed' where id=c.id;
  perform private.write_contract_audit(c.id,'contract.owner_signed',jsonb_build_object('signature_id',signature_id,'method',target_method)); return signature_id;
end; $$;

-- ---------------------------------------------------------------------------
-- 4. send_lease_contract — RBAC + contracts feature
-- ---------------------------------------------------------------------------
create or replace function public.send_lease_contract(target_contract_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.lease_contracts%rowtype; access_id uuid;
begin
  select * into c from public.lease_contracts where id=target_contract_id for update;
  if c.id is null or not (select private.has_capability(c.organization_id,'contract.manage')) then raise exception 'not_found' using errcode='42501'; end if;
  if not (select public.org_has_feature(c.organization_id,'contracts')) then
    raise exception 'PLAN_FEATURE_NOT_AVAILABLE' using errcode='42501',
      detail=format('{"code":"PLAN_FEATURE_NOT_AVAILABLE","feature":"contracts"}');
  end if;
  if c.status <> 'owner_signed' then raise exception 'invalid_contract_state' using errcode='22023'; end if;
  select a.id into access_id from public.tenant_portal_accesses a join public.tenant_portal_lease_accesses la
    on la.organization_id=a.organization_id and la.access_id=a.id and la.tenant_id=a.tenant_id
    where a.organization_id=c.organization_id and a.tenant_id=c.tenant_id and a.status='active' and la.lease_id=c.lease_id;
  if access_id is null then raise exception 'active_portal_access_required' using errcode='22023'; end if;
  update public.lease_contracts set status='sent',sent_by=auth.uid(),sent_at=now() where id=c.id;
  insert into public.notifications (organization_id,recipient_user_id,recipient_tenant_portal_access_id,required_capability,notification_type,deduplication_key,title_code,payload,tenant_id,lease_id)
    values (c.organization_id,null,access_id,'contract.manage','contract_ready','contract-ready:'||c.id,'contract.ready',jsonb_build_object('contractId',c.id,'reference',c.reference),c.tenant_id,c.lease_id)
    on conflict (organization_id,recipient_tenant_portal_access_id,deduplication_key) where recipient_tenant_portal_access_id is not null do nothing;
  perform private.write_contract_audit(c.id,'contract.sent',jsonb_build_object('access_id',access_id)); return c.id;
end; $$;

-- ---------------------------------------------------------------------------
-- 5. cancel_lease_contract — RBAC + contracts feature
-- ---------------------------------------------------------------------------
create or replace function public.cancel_lease_contract(target_contract_id uuid,target_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.lease_contracts%rowtype;
begin
  select * into c from public.lease_contracts where id=target_contract_id for update;
  if c.id is null or not (select private.has_capability(c.organization_id,'contract.manage')) then raise exception 'not_found' using errcode='42501'; end if;
  if not (select public.org_has_feature(c.organization_id,'contracts')) then
    raise exception 'PLAN_FEATURE_NOT_AVAILABLE' using errcode='42501',
      detail=format('{"code":"PLAN_FEATURE_NOT_AVAILABLE","feature":"contracts"}');
  end if;
  if c.status in ('completed','cancelled') or char_length(trim(target_reason)) not between 3 and 500 then raise exception 'invalid_contract_state' using errcode='22023'; end if;
  update public.lease_contracts set status='cancelled',cancelled_by=auth.uid(),cancelled_at=now(),cancellation_reason=trim(target_reason) where id=c.id;
  perform private.write_contract_audit(c.id,'contract.cancelled',jsonb_build_object('reason',trim(target_reason))); return c.id;
end; $$;

-- ---------------------------------------------------------------------------
-- 6. duplicate_contract_template — RBAC + contract_templates_custom (Avancé+)
-- ---------------------------------------------------------------------------
create or replace function public.duplicate_contract_template(target_organization_id uuid,target_template_id uuid,target_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare source public.contract_templates%rowtype; new_id uuid;
begin
  if not (select private.has_capability(target_organization_id,'contract.manage')) then raise exception 'forbidden' using errcode='42501'; end if;
  if not (select public.org_has_feature(target_organization_id,'contract_templates_custom')) then
    raise exception 'PLAN_FEATURE_NOT_AVAILABLE' using errcode='42501',
      detail=format('{"code":"PLAN_FEATURE_NOT_AVAILABLE","feature":"contract_templates_custom"}');
  end if;
  select * into source from public.contract_templates where id=target_template_id and (is_system or organization_id=target_organization_id);
  if source.id is null or char_length(trim(target_name)) not between 2 and 120 then raise exception 'invalid_template' using errcode='22023'; end if;
  insert into public.contract_templates (organization_id,family_key,name,language,version,status,is_system,is_default,source_template_id,sections,created_by)
    values (target_organization_id,'custom-'||replace(gen_random_uuid()::text,'-',''),trim(target_name),source.language,1,'active',false,false,source.id,source.sections,auth.uid())
    returning id into new_id;
  return new_id;
end; $$;

-- ---------------------------------------------------------------------------
-- 7. create_contract_template_version — RBAC + contract_templates_custom (Avancé+)
-- ---------------------------------------------------------------------------
create or replace function public.create_contract_template_version(target_template_id uuid,target_name text,target_sections jsonb,target_make_default boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare source public.contract_templates%rowtype; new_id uuid;
begin
  select * into source from public.contract_templates where id=target_template_id and not is_system and status='active';
  if source.id is null or not (select private.has_capability(source.organization_id,'contract.manage')) then raise exception 'not_found' using errcode='42501'; end if;
  if not (select public.org_has_feature(source.organization_id,'contract_templates_custom')) then
    raise exception 'PLAN_FEATURE_NOT_AVAILABLE' using errcode='42501',
      detail=format('{"code":"PLAN_FEATURE_NOT_AVAILABLE","feature":"contract_templates_custom"}');
  end if;
  if char_length(trim(target_name)) not between 2 and 120 or not (select private.valid_contract_sections(target_sections)) then
    raise exception 'invalid_template' using errcode='22023';
  end if;
  update public.contract_templates set status='inactive',is_default=false where organization_id=source.organization_id and family_key=source.family_key and status='active';
  if target_make_default then update public.contract_templates set is_default=false where organization_id=source.organization_id and language=source.language; end if;
  insert into public.contract_templates (organization_id,family_key,name,language,version,status,is_system,is_default,source_template_id,sections,created_by)
    values (source.organization_id,source.family_key,trim(target_name),source.language,source.version+1,'active',false,target_make_default,source.id,target_sections,auth.uid()) returning id into new_id;
  return new_id;
end; $$;

-- ---------------------------------------------------------------------------
-- 8. save_organization_contract_settings — RBAC + contracts feature
-- ---------------------------------------------------------------------------
create or replace function public.save_organization_contract_settings(target_organization_id uuid,target_enabled boolean,target_name text,target_company text,target_phone text,target_address text,target_position text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.has_capability(target_organization_id,'contract.manage')) then raise exception 'forbidden' using errcode='42501'; end if;
  if not (select public.org_has_feature(target_organization_id,'contracts')) then
    raise exception 'PLAN_FEATURE_NOT_AVAILABLE' using errcode='42501',
      detail=format('{"code":"PLAN_FEATURE_NOT_AVAILABLE","feature":"contracts"}');
  end if;
  insert into public.organization_contract_settings (organization_id,stamp_enabled,stamp_name,stamp_company,stamp_phone,stamp_short_address,stamp_position,updated_by)
    values (target_organization_id,target_enabled,nullif(trim(target_name),''),nullif(trim(target_company),''),nullif(trim(target_phone),''),nullif(trim(target_address),''),target_position,auth.uid())
  on conflict (organization_id) do update set stamp_enabled=excluded.stamp_enabled,stamp_name=excluded.stamp_name,stamp_company=excluded.stamp_company,
    stamp_phone=excluded.stamp_phone,stamp_short_address=excluded.stamp_short_address,stamp_position=excluded.stamp_position,stamp_position=excluded.stamp_position,updated_by=auth.uid(),updated_at=now();
  return target_organization_id;
end; $$;

commit;
