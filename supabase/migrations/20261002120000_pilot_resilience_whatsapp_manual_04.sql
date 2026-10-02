begin;

-- PILOT-RESILIENCE-WHATSAPP-04 — extension additive de la fondation existante.
-- Aucun fournisseur n'est activé et aucune migration historique n'est modifiée.
alter table public.tenant_communication_preferences
  add column country_code text check (country_code is null or country_code in ('CA','CM','CD','CI','KE','NG','SN','ZA')),
  add column calling_code text check (calling_code is null or calling_code ~ '^[1-9][0-9]{0,3}$'),
  add column national_number text check (national_number is null or national_number ~ '^[0-9]{6,14}$'),
  add column whatsapp_status text not null default 'unknown' check (whatsapp_status in ('unknown','declared','verified','disabled')),
  add column service_consent_source text default 'legacy_foundation',
  add column service_consent_version text default 'foundation-01',
  add column marketing_consent_source text default 'legacy_foundation',
  add column marketing_consent_version text default 'foundation-01';

update public.tenant_communication_preferences
set whatsapp_status = case when whatsapp_capable then 'declared' else 'unknown' end
where whatsapp_status = 'unknown';

alter table public.tenant_communication_preferences
  add constraint tenant_whatsapp_structured_phone_check check (
    (phone_e164 is null and country_code is null and calling_code is null and national_number is null)
    or (phone_e164 is not null and country_code is null and calling_code is null and national_number is null)
    or (phone_e164 is not null and country_code is not null and calling_code is not null and national_number is not null)
  ),
  add constraint tenant_whatsapp_state_phone_check check (
    whatsapp_status in ('unknown','disabled') or phone_e164 is not null
  ),
  add constraint tenant_whatsapp_service_metadata_check check (
    whatsapp_transactional_consented_at is null
    or (service_consent_source is not null and service_consent_version is not null)
  ),
  add constraint tenant_whatsapp_marketing_metadata_check check (
    whatsapp_marketing_consented_at is null
    or (marketing_consent_source is not null and marketing_consent_version is not null)
  );

create table public.tenant_whatsapp_consent_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  tenant_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  action text not null check (action in (
    'preferences_saved','service_consented','service_revoked','marketing_consented','marketing_revoked',
    'number_changed','tenant_verified','disabled','whatsapp_open_requested'
  )),
  whatsapp_status text not null check (whatsapp_status in ('unknown','declared','verified','disabled')),
  phone_fingerprint text check (phone_fingerprint is null or phone_fingerprint ~ '^[a-f0-9]{64}$'),
  consent_source text,
  consent_version text,
  document_id uuid references public.financial_documents(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (organization_id, tenant_id) references public.tenants(organization_id,id) on delete restrict
);

alter table public.tenant_whatsapp_consent_events enable row level security;
revoke all on public.tenant_whatsapp_consent_events from public, anon, authenticated;
grant select, insert on public.tenant_whatsapp_consent_events to service_role;

create or replace function private.prevent_tenant_whatsapp_event_mutation()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'whatsapp_consent_history_is_immutable' using errcode='55000'; end; $$;
create trigger tenant_whatsapp_consent_events_immutable
before update or delete on public.tenant_whatsapp_consent_events
for each row execute function private.prevent_tenant_whatsapp_event_mutation();

create or replace function public.save_tenant_whatsapp_preferences_v2(
  target_tenant_id uuid, p_country_code text, p_calling_code text, p_national_number text,
  p_phone_e164 text, p_whatsapp_declared boolean, p_preferred_channel text,
  p_service_consent boolean, p_marketing_consent boolean,
  p_consent_source text, p_consent_version text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  tenant public.tenants%rowtype; previous public.tenant_communication_preferences%rowtype;
  actor uuid := (select auth.uid()); next_status text; changed boolean;
begin
  select * into tenant from public.tenants where id=target_tenant_id;
  if actor is null or tenant.id is null or not private.has_capability(tenant.organization_id,'tenant.manage') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if p_preferred_channel is null or p_preferred_channel not in ('in_app','email','whatsapp')
     or p_whatsapp_declared is null or p_service_consent is null or p_marketing_consent is null
     or p_country_code is null or p_country_code not in ('CA','CM','CD','CI','KE','NG','SN','ZA')
     or p_calling_code is null or p_calling_code !~ '^[1-9][0-9]{0,3}$'
     or p_national_number is null or p_national_number !~ '^[0-9]{6,14}$'
     or p_phone_e164 is null or p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$'
     or p_phone_e164 <> '+' || p_calling_code || p_national_number
     or char_length(coalesce(trim(p_consent_source),'')) not between 2 and 80
     or char_length(coalesce(trim(p_consent_version),'')) not between 2 and 80 then
    raise exception 'invalid_whatsapp_preferences' using errcode='22023';
  end if;
  if p_preferred_channel='whatsapp' and (not coalesce(p_whatsapp_declared,false) or not p_service_consent) then
    raise exception 'whatsapp_consent_required' using errcode='22023';
  end if;
  select * into previous from public.tenant_communication_preferences where tenant_id=tenant.id for update;
  changed := previous.tenant_id is not null and previous.phone_e164 is distinct from p_phone_e164;
  next_status := case
    when previous.tenant_id is not null and not changed
      and previous.whatsapp_status = 'verified' and coalesce(p_whatsapp_declared,false) then 'verified'
    when coalesce(p_whatsapp_declared,false) then 'declared'
    else 'unknown'
  end;
  insert into public.tenant_communication_preferences(
    tenant_id,organization_id,phone_e164,whatsapp_capable,preferred_channel,
    whatsapp_transactional_consented_at,whatsapp_marketing_consented_at,updated_by,
    country_code,calling_code,national_number,whatsapp_status,
    service_consent_source,service_consent_version,marketing_consent_source,marketing_consent_version
  ) values (
    tenant.id,tenant.organization_id,p_phone_e164,coalesce(p_whatsapp_declared,false),p_preferred_channel,
    case when p_service_consent then now() end,case when p_marketing_consent then now() end,actor,
    p_country_code,p_calling_code,p_national_number,next_status,
    case when p_service_consent then trim(p_consent_source) end,case when p_service_consent then trim(p_consent_version) end,
    case when p_marketing_consent then trim(p_consent_source) end,case when p_marketing_consent then trim(p_consent_version) end
  ) on conflict(tenant_id) do update set
    phone_e164=excluded.phone_e164,whatsapp_capable=excluded.whatsapp_capable,preferred_channel=excluded.preferred_channel,
    country_code=excluded.country_code,calling_code=excluded.calling_code,national_number=excluded.national_number,
    whatsapp_status=next_status,
    whatsapp_transactional_consented_at=case when p_service_consent then coalesce(public.tenant_communication_preferences.whatsapp_transactional_consented_at,now()) else public.tenant_communication_preferences.whatsapp_transactional_consented_at end,
    whatsapp_transactional_revoked_at=case when not p_service_consent and public.tenant_communication_preferences.whatsapp_transactional_consented_at is not null then now() end,
    whatsapp_marketing_consented_at=case when p_marketing_consent then coalesce(public.tenant_communication_preferences.whatsapp_marketing_consented_at,now()) else public.tenant_communication_preferences.whatsapp_marketing_consented_at end,
    whatsapp_marketing_revoked_at=case when not p_marketing_consent and public.tenant_communication_preferences.whatsapp_marketing_consented_at is not null then now() end,
    service_consent_source=case when p_service_consent then trim(p_consent_source) else public.tenant_communication_preferences.service_consent_source end,
    service_consent_version=case when p_service_consent then trim(p_consent_version) else public.tenant_communication_preferences.service_consent_version end,
    marketing_consent_source=case when p_marketing_consent then trim(p_consent_source) else public.tenant_communication_preferences.marketing_consent_source end,
    marketing_consent_version=case when p_marketing_consent then trim(p_consent_version) else public.tenant_communication_preferences.marketing_consent_version end,
    updated_by=actor,updated_at=now();
  insert into public.tenant_whatsapp_consent_events(organization_id,tenant_id,actor_user_id,action,whatsapp_status,phone_fingerprint,consent_source,consent_version)
  values(tenant.organization_id,tenant.id,actor,case when changed then 'number_changed' else 'preferences_saved' end,next_status,
    encode(extensions.digest(p_phone_e164,'sha256'),'hex'),trim(p_consent_source),trim(p_consent_version));
  return jsonb_build_object('tenantId',tenant.id,'saved',true,'whatsappStatus',next_status);
end; $$;

create or replace function public.prepare_manual_whatsapp_handoff(target_document_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  doc public.financial_documents%rowtype; pref public.tenant_communication_preferences%rowtype;
  tenant public.tenants%rowtype; actor uuid := (select auth.uid());
begin
  select * into doc from public.financial_documents where id=target_document_id;
  if actor is null or doc.id is null or not private.has_capability(doc.organization_id,'receipt.share') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if not exists(select 1 from public.organizations where id=doc.organization_id and status='active') then
    raise exception 'organization_unavailable' using errcode='42501';
  end if;
  if doc.status <> 'ready' or coalesce(doc.review_status,'approved') <> 'approved' then
    raise exception 'document_not_approved' using errcode='22023';
  end if;
  select * into tenant from public.tenants where id=doc.tenant_id and organization_id=doc.organization_id;
  select * into pref from public.tenant_communication_preferences where tenant_id=tenant.id and organization_id=doc.organization_id;
  if pref.phone_e164 is null or pref.whatsapp_status not in ('declared','verified')
     or pref.whatsapp_transactional_consented_at is null or pref.whatsapp_transactional_revoked_at is not null then
    raise exception 'whatsapp_not_available' using errcode='22023';
  end if;
  insert into public.tenant_whatsapp_consent_events(organization_id,tenant_id,actor_user_id,action,whatsapp_status,phone_fingerprint,document_id)
  values(doc.organization_id,tenant.id,actor,'whatsapp_open_requested',pref.whatsapp_status,
    encode(extensions.digest(pref.phone_e164,'sha256'),'hex'),doc.id);
  return jsonb_build_object(
    'phoneE164',pref.phone_e164,'displayName',tenant.full_name,
    'language',coalesce(tenant.preferred_language,doc.language,'fr'),'documentType',doc.document_type,
    'periodStart',doc.period_start,'periodEnd',doc.period_end
  );
end; $$;

create or replace function public.set_my_tenant_whatsapp_status(
  target_access_id uuid, p_action text, p_consent_version text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  access public.tenant_portal_accesses%rowtype; pref public.tenant_communication_preferences%rowtype;
  actor uuid := (select auth.uid()); next_status text;
begin
  if actor is null or not private.has_active_tenant_portal_access(target_access_id) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if p_action not in ('confirm','disable') or char_length(coalesce(trim(p_consent_version),'')) not between 2 and 80 then
    raise exception 'invalid_action' using errcode='22023';
  end if;
  select * into access from public.tenant_portal_accesses
  where id=target_access_id and user_id=actor and status='active' for update;
  select * into pref from public.tenant_communication_preferences
  where tenant_id=access.tenant_id and organization_id=access.organization_id for update;
  if pref.tenant_id is null or pref.phone_e164 is null then
    raise exception 'phone_required' using errcode='22023';
  end if;
  next_status := case when p_action='confirm' then 'verified' else 'disabled' end;
  update public.tenant_communication_preferences set
    whatsapp_status=next_status,
    whatsapp_capable=(p_action='confirm'),
    preferred_channel=case when p_action='disable' and preferred_channel='whatsapp' then 'in_app' else preferred_channel end,
    whatsapp_transactional_consented_at=case when p_action='confirm' then coalesce(whatsapp_transactional_consented_at,now()) else whatsapp_transactional_consented_at end,
    whatsapp_transactional_revoked_at=case when p_action='confirm' then null else case when whatsapp_transactional_consented_at is not null then now() end end,
    service_consent_source='tenant_portal',service_consent_version=trim(p_consent_version),updated_by=actor,updated_at=now()
  where tenant_id=access.tenant_id;
  insert into public.tenant_whatsapp_consent_events(organization_id,tenant_id,actor_user_id,action,whatsapp_status,phone_fingerprint,consent_source,consent_version)
  values(access.organization_id,access.tenant_id,actor,case when p_action='confirm' then 'tenant_verified' else 'disabled' end,next_status,
    encode(extensions.digest(pref.phone_e164,'sha256'),'hex'),'tenant_portal',trim(p_consent_version));
  return jsonb_build_object('saved',true,'whatsappStatus',next_status);
end; $$;

revoke all on function public.save_tenant_whatsapp_preferences_v2(uuid,text,text,text,text,boolean,text,boolean,boolean,text,text) from public,anon;
revoke all on function public.prepare_manual_whatsapp_handoff(uuid) from public,anon;
revoke all on function public.set_my_tenant_whatsapp_status(uuid,text,text) from public,anon;
grant execute on function public.save_tenant_whatsapp_preferences_v2(uuid,text,text,text,text,boolean,text,boolean,boolean,text,text) to authenticated;
grant execute on function public.prepare_manual_whatsapp_handoff(uuid) to authenticated;
grant execute on function public.set_my_tenant_whatsapp_status(uuid,text,text) to authenticated;

commit;
