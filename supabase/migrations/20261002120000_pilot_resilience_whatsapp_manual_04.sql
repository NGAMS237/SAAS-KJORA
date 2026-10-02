begin;

-- PILOT-RESILIENCE-WHATSAPP-04 v2. Manual handoff only: no provider is enabled.
create table private.supported_phone_countries (
  country_code text primary key check (country_code ~ '^[A-Z]{2}$'),
  calling_code text not null unique check (calling_code ~ '^[1-9][0-9]{0,3}$'),
  national_length smallint not null check (national_length between 6 and 14),
  national_pattern text not null check (national_pattern ~ '^\^' and national_pattern ~ '\$$')
);
insert into private.supported_phone_countries values
 ('CA','1',10,'^[1-9][0-9]{9}$'),('CM','237',9,'^[1-9][0-9]{8}$'),('SN','221',9,'^[1-9][0-9]{8}$'),
 ('CI','225',10,'^0[157][0-9]{8}$'),('BJ','229',10,'^01[0-9]{8}$'),('BF','226',8,'^[1-9][0-9]{7}$'),
 ('GW','245',9,'^[1-9][0-9]{8}$'),('ML','223',8,'^[1-9][0-9]{7}$'),('NE','227',8,'^[1-9][0-9]{7}$'),
 ('TG','228',8,'^[1-9][0-9]{7}$'),('NG','234',10,'^[1-9][0-9]{9}$'),('CD','243',9,'^[1-9][0-9]{8}$'),
 ('KE','254',9,'^[1-9][0-9]{8}$'),('ZA','27',9,'^[1-9][0-9]{8}$');
revoke all on private.supported_phone_countries from public,anon,authenticated;

create or replace function private.assert_supported_whatsapp_phone(p_country_code text,p_calling_code text,p_national_number text,p_phone_e164 text)
returns void language plpgsql security definer set search_path='' as $$
declare c private.supported_phone_countries%rowtype;
begin
  select * into c from private.supported_phone_countries where country_code=p_country_code;
  if c.country_code is null or p_calling_code is distinct from c.calling_code
    or p_national_number is null or p_national_number !~ c.national_pattern
    or p_phone_e164 is distinct from ('+'||c.calling_code||p_national_number) then
    raise exception 'invalid_whatsapp_phone' using errcode='22023';
  end if;
end; $$;
revoke all on function private.assert_supported_whatsapp_phone(text,text,text,text) from public,anon,authenticated;

alter table public.tenant_communication_preferences
 add column country_code text, add column calling_code text, add column national_number text,
 add column whatsapp_status text not null default 'unknown' check (whatsapp_status in ('unknown','declared','tenant_confirmed','verified','disabled')),
 add column service_consent_source text default 'legacy_foundation', add column service_consent_version text default 'foundation-01',
 add column marketing_consent_source text default 'legacy_foundation', add column marketing_consent_version text default 'foundation-01';
update public.tenant_communication_preferences set whatsapp_status=case when whatsapp_capable then 'declared' else 'unknown' end where whatsapp_status='unknown';
alter table public.tenant_communication_preferences
 add constraint tenant_whatsapp_structured_phone_check check ((country_code is null and calling_code is null and national_number is null) or (country_code is not null and calling_code is not null and national_number is not null and phone_e164 is not null)),
 add constraint tenant_whatsapp_state_phone_check check (whatsapp_status in ('unknown','disabled') or phone_e164 is not null),
 add constraint tenant_whatsapp_service_metadata_check check (whatsapp_transactional_consented_at is null or (service_consent_source is not null and service_consent_version is not null)),
 add constraint tenant_whatsapp_marketing_metadata_check check (whatsapp_marketing_consented_at is null or (marketing_consent_source is not null and marketing_consent_version is not null));

create table public.tenant_whatsapp_consent_events (
 id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id) on delete restrict,
 tenant_id uuid not null, actor_user_id uuid not null references auth.users(id),
 action text not null check (action in ('preferences_saved','number_changed','service_consented','service_revoked','marketing_consented','marketing_revoked','tenant_confirmed','disabled','whatsapp_open_requested')),
 whatsapp_status text not null check (whatsapp_status in ('unknown','declared','tenant_confirmed','verified','disabled')),
 consent_source text, consent_version text, document_id uuid references public.financial_documents(id) on delete restrict,
 created_at timestamptz not null default now(), foreign key (organization_id,tenant_id) references public.tenants(organization_id,id) on delete restrict
);
create table public.user_communication_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade, country_code text not null, calling_code text not null, national_number text not null,
 phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'), whatsapp_declared boolean not null default false,
 whatsapp_status text not null default 'unknown' check (whatsapp_status in ('unknown','declared','verified','disabled')),
 preferred_channel text not null default 'in_app' check (preferred_channel in ('in_app','email','whatsapp')),
 service_consented_at timestamptz, service_revoked_at timestamptz, marketing_consented_at timestamptz, marketing_revoked_at timestamptz,
 consent_source text not null, consent_version text not null, updated_at timestamptz not null default now(),
 check (preferred_channel <> 'whatsapp' or (whatsapp_declared and service_consented_at is not null and service_revoked_at is null))
);
create table public.partner_application_communication_preferences (
 application_id uuid primary key references public.partner_applications(id) on delete cascade, country_code text not null, calling_code text not null, national_number text not null,
 phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'), whatsapp_declared boolean not null default false,
 whatsapp_status text not null default 'unknown' check (whatsapp_status in ('unknown','declared','disabled')),
 preferred_channel text not null check (preferred_channel in ('email','whatsapp')),
 service_consented_at timestamptz, service_revoked_at timestamptz, marketing_consented_at timestamptz, marketing_revoked_at timestamptz,
 consent_source text not null, consent_version text not null, created_at timestamptz not null default now()
);
create table public.personal_whatsapp_consent_events (
 id bigint generated always as identity primary key, user_id uuid references auth.users(id) on delete restrict,
 partner_application_id uuid references public.partner_applications(id) on delete restrict,
 action text not null check (action in ('preferences_saved','number_changed','service_consented','service_revoked','marketing_consented','marketing_revoked')),
 consent_source text not null, consent_version text not null, created_at timestamptz not null default now(),
 check ((user_id is not null)::integer+(partner_application_id is not null)::integer=1)
);
alter table public.tenant_whatsapp_consent_events enable row level security;
alter table public.user_communication_preferences enable row level security;
alter table public.partner_application_communication_preferences enable row level security;
alter table public.personal_whatsapp_consent_events enable row level security;
revoke all on public.tenant_whatsapp_consent_events,public.user_communication_preferences,public.partner_application_communication_preferences,public.personal_whatsapp_consent_events from public,anon,authenticated;

create or replace function private.prevent_whatsapp_event_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'whatsapp_consent_history_is_immutable' using errcode='55000'; end; $$;
create trigger tenant_whatsapp_consent_events_immutable before update or delete on public.tenant_whatsapp_consent_events for each row execute function private.prevent_whatsapp_event_mutation();
create trigger personal_whatsapp_consent_events_immutable before update or delete on public.personal_whatsapp_consent_events for each row execute function private.prevent_whatsapp_event_mutation();

create or replace function public.save_tenant_whatsapp_preferences_v2(target_tenant_id uuid,p_country_code text,p_calling_code text,p_national_number text,p_phone_e164 text,
 p_whatsapp_declared boolean,p_preferred_channel text,p_service_consent boolean,p_marketing_consent boolean,p_consent_source text,p_consent_version text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tenants%rowtype; old public.tenant_communication_preferences%rowtype; actor uuid:=(select auth.uid()); next_status text; changed boolean;
begin
 select * into t from public.tenants where id=target_tenant_id;
 if actor is null or t.id is null or not private.has_capability(t.organization_id,'tenant.manage') then raise exception 'forbidden' using errcode='42501'; end if;
 if p_marketing_consent is not false then raise exception 'tenant_marketing_consent_requires_tenant_action' using errcode='42501'; end if;
 if p_whatsapp_declared is null or p_service_consent is null or p_preferred_channel not in ('in_app','email','whatsapp')
  or char_length(coalesce(trim(p_consent_source),'')) not between 2 and 80 or char_length(coalesce(trim(p_consent_version),'')) not between 2 and 80 then raise exception 'invalid_whatsapp_preferences' using errcode='22023'; end if;
 perform private.assert_supported_whatsapp_phone(p_country_code,p_calling_code,p_national_number,p_phone_e164);
 if p_preferred_channel='whatsapp' and (not p_whatsapp_declared or not p_service_consent) then raise exception 'whatsapp_consent_required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('tenant-whatsapp:'||t.id::text,0));
 select * into old from public.tenant_communication_preferences where tenant_id=t.id for update;
 changed:=old.tenant_id is not null and old.phone_e164 is distinct from p_phone_e164;
 next_status:=case when not p_whatsapp_declared then 'unknown' when not changed and old.whatsapp_status in ('tenant_confirmed','verified') then old.whatsapp_status else 'declared' end;
 insert into public.tenant_communication_preferences(tenant_id,organization_id,phone_e164,whatsapp_capable,preferred_channel,whatsapp_transactional_consented_at,whatsapp_transactional_revoked_at,
  whatsapp_marketing_consented_at,whatsapp_marketing_revoked_at,updated_by,country_code,calling_code,national_number,whatsapp_status,service_consent_source,service_consent_version,marketing_consent_source,marketing_consent_version)
 values(t.id,t.organization_id,p_phone_e164,p_whatsapp_declared,p_preferred_channel,case when p_service_consent then now() end,null,null,null,actor,p_country_code,p_calling_code,p_national_number,next_status,
  trim(p_consent_source),trim(p_consent_version),null,null)
 on conflict(tenant_id) do update set phone_e164=excluded.phone_e164,whatsapp_capable=excluded.whatsapp_capable,preferred_channel=excluded.preferred_channel,
  country_code=excluded.country_code,calling_code=excluded.calling_code,national_number=excluded.national_number,whatsapp_status=next_status,
  whatsapp_transactional_consented_at=case when p_service_consent then coalesce(public.tenant_communication_preferences.whatsapp_transactional_consented_at,now()) else public.tenant_communication_preferences.whatsapp_transactional_consented_at end,
  whatsapp_transactional_revoked_at=case when p_service_consent then null when public.tenant_communication_preferences.whatsapp_transactional_consented_at is not null then coalesce(public.tenant_communication_preferences.whatsapp_transactional_revoked_at,now()) end,
  whatsapp_marketing_revoked_at=case when changed and public.tenant_communication_preferences.whatsapp_marketing_consented_at is not null then coalesce(public.tenant_communication_preferences.whatsapp_marketing_revoked_at,now()) else public.tenant_communication_preferences.whatsapp_marketing_revoked_at end,
  service_consent_source=trim(p_consent_source),service_consent_version=trim(p_consent_version),updated_by=actor,updated_at=now();
 insert into public.tenant_whatsapp_consent_events(organization_id,tenant_id,actor_user_id,action,whatsapp_status,consent_source,consent_version)
 values(t.organization_id,t.id,actor,case when changed then 'number_changed' else 'preferences_saved' end,next_status,trim(p_consent_source),trim(p_consent_version));
 return jsonb_build_object('tenantId',t.id,'saved',true,'whatsappStatus',next_status);
end; $$;

create or replace function public.prepare_manual_whatsapp_handoff(target_document_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.financial_documents%rowtype; p public.tenant_communication_preferences%rowtype; t public.tenants%rowtype; actor uuid:=(select auth.uid());
begin
 select * into d from public.financial_documents where id=target_document_id;
 if actor is null or d.id is null or not private.has_capability(d.organization_id,'receipt.share') then raise exception 'forbidden' using errcode='42501'; end if;
 if not exists(select 1 from public.organizations where id=d.organization_id and status='active') then raise exception 'organization_unavailable' using errcode='42501'; end if;
 if d.status is distinct from 'ready' or d.review_status is distinct from 'approved' then raise exception 'document_not_approved' using errcode='22023'; end if;
 select * into t from public.tenants where id=d.tenant_id and organization_id=d.organization_id;
 select * into p from public.tenant_communication_preferences where tenant_id=t.id and organization_id=d.organization_id;
 if p.phone_e164 is null or p.whatsapp_status not in ('declared','tenant_confirmed','verified') or p.whatsapp_transactional_consented_at is null or p.whatsapp_transactional_revoked_at is not null then raise exception 'whatsapp_not_available' using errcode='22023'; end if;
 insert into public.tenant_whatsapp_consent_events(organization_id,tenant_id,actor_user_id,action,whatsapp_status,document_id) values(d.organization_id,t.id,actor,'whatsapp_open_requested',p.whatsapp_status,d.id);
 return jsonb_build_object('phoneE164',p.phone_e164,'displayName',coalesce(nullif(trim(t.full_name),''),'KJORA'),'language',case when coalesce(t.preferred_language,d.language)='en' then 'en' else 'fr' end,
  'documentType',case when d.document_type in ('due_notice','payment_receipt','rent_receipt','account_statement') then d.document_type else null end,'periodStart',d.period_start,'periodEnd',d.period_end);
end; $$;

create or replace function public.set_my_tenant_whatsapp_status(target_access_id uuid,p_action text,p_consent_version text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.tenant_portal_accesses%rowtype; p public.tenant_communication_preferences%rowtype; actor uuid:=(select auth.uid()); next_status text;
begin
 if actor is null or not private.has_active_tenant_portal_access(target_access_id) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_action not in ('confirm_service','disable','consent_marketing','revoke_marketing') or char_length(coalesce(trim(p_consent_version),'')) not between 2 and 80 then raise exception 'invalid_action' using errcode='22023'; end if;
 select * into a from public.tenant_portal_accesses where id=target_access_id and user_id=actor and status='active' for update;
 perform pg_advisory_xact_lock(hashtextextended('tenant-whatsapp:'||a.tenant_id::text,0));
 select * into p from public.tenant_communication_preferences where tenant_id=a.tenant_id and organization_id=a.organization_id for update;
 if p.tenant_id is null or p.phone_e164 is null then raise exception 'phone_required' using errcode='22023'; end if;
 if p_action='consent_marketing' and p.whatsapp_status not in ('tenant_confirmed','verified') then raise exception 'service_confirmation_required' using errcode='22023'; end if;
 next_status:=case when p_action='confirm_service' then 'tenant_confirmed' when p_action='disable' then 'disabled' else p.whatsapp_status end;
 update public.tenant_communication_preferences set whatsapp_status=next_status,whatsapp_capable=(p_action<>'disable'),preferred_channel=case when p_action='disable' and preferred_channel='whatsapp' then 'in_app' else preferred_channel end,
  whatsapp_transactional_consented_at=case when p_action='confirm_service' then coalesce(whatsapp_transactional_consented_at,now()) else whatsapp_transactional_consented_at end,
  whatsapp_transactional_revoked_at=case when p_action='confirm_service' then null when p_action='disable' and whatsapp_transactional_consented_at is not null then coalesce(whatsapp_transactional_revoked_at,now()) else whatsapp_transactional_revoked_at end,
  whatsapp_marketing_consented_at=case when p_action='consent_marketing' then coalesce(whatsapp_marketing_consented_at,now()) else whatsapp_marketing_consented_at end,
  whatsapp_marketing_revoked_at=case when p_action='consent_marketing' then null when p_action in ('revoke_marketing','disable') and whatsapp_marketing_consented_at is not null then coalesce(whatsapp_marketing_revoked_at,now()) else whatsapp_marketing_revoked_at end,
  service_consent_source=case when p_action in ('confirm_service','disable') then 'tenant_portal' else service_consent_source end,service_consent_version=case when p_action in ('confirm_service','disable') then trim(p_consent_version) else service_consent_version end,
  marketing_consent_source=case when p_action in ('consent_marketing','revoke_marketing','disable') then 'tenant_portal' else marketing_consent_source end,marketing_consent_version=case when p_action in ('consent_marketing','revoke_marketing','disable') then trim(p_consent_version) else marketing_consent_version end,
  updated_by=actor,updated_at=now() where tenant_id=a.tenant_id;
 insert into public.tenant_whatsapp_consent_events(organization_id,tenant_id,actor_user_id,action,whatsapp_status,consent_source,consent_version)
 values(a.organization_id,a.tenant_id,actor,case p_action when 'confirm_service' then 'tenant_confirmed' when 'disable' then 'disabled' when 'consent_marketing' then 'marketing_consented' else 'marketing_revoked' end,next_status,'tenant_portal',trim(p_consent_version));
 return jsonb_build_object('saved',true,'whatsappStatus',next_status);
end; $$;

create or replace function public.get_my_whatsapp_preferences() returns jsonb language sql security definer set search_path='' stable as $$
 select case when (select auth.uid()) is null then null else coalesce((select jsonb_build_object('countryCode',country_code,'callingCode',calling_code,'nationalNumber',national_number,'phoneE164',phone_e164,
  'whatsappDeclared',whatsapp_declared,'whatsappStatus',whatsapp_status,'preferredChannel',preferred_channel,'serviceConsent',service_consented_at is not null and service_revoked_at is null,
  'marketingConsent',marketing_consented_at is not null and marketing_revoked_at is null) from public.user_communication_preferences where user_id=(select auth.uid())),'{}'::jsonb) end;
$$;

create or replace function public.save_my_whatsapp_preferences(p_country_code text,p_calling_code text,p_national_number text,p_phone_e164 text,p_whatsapp_declared boolean,p_preferred_channel text,
 p_service_consent boolean,p_marketing_consent boolean,p_consent_source text,p_consent_version text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); old public.user_communication_preferences%rowtype; changed boolean;
begin
 if actor is null then raise exception 'forbidden' using errcode='42501'; end if;
 if p_whatsapp_declared is null or p_service_consent is null or p_marketing_consent is null or p_preferred_channel not in ('in_app','email','whatsapp') or char_length(coalesce(trim(p_consent_source),'')) not between 2 and 80 or char_length(coalesce(trim(p_consent_version),'')) not between 2 and 80 then raise exception 'invalid_whatsapp_preferences' using errcode='22023'; end if;
 perform private.assert_supported_whatsapp_phone(p_country_code,p_calling_code,p_national_number,p_phone_e164);
 if p_preferred_channel='whatsapp' and (not p_whatsapp_declared or not p_service_consent) then raise exception 'whatsapp_consent_required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('user-whatsapp:'||actor::text,0));
 select * into old from public.user_communication_preferences where user_id=actor for update; changed:=old.user_id is not null and old.phone_e164 is distinct from p_phone_e164;
 insert into public.user_communication_preferences(user_id,country_code,calling_code,national_number,phone_e164,whatsapp_declared,whatsapp_status,preferred_channel,service_consented_at,marketing_consented_at,consent_source,consent_version)
 values(actor,p_country_code,p_calling_code,p_national_number,p_phone_e164,p_whatsapp_declared,case when p_whatsapp_declared then 'declared' else 'unknown' end,p_preferred_channel,case when p_service_consent then now() end,case when p_marketing_consent then now() end,trim(p_consent_source),trim(p_consent_version))
 on conflict(user_id) do update set country_code=excluded.country_code,calling_code=excluded.calling_code,national_number=excluded.national_number,phone_e164=excluded.phone_e164,whatsapp_declared=excluded.whatsapp_declared,
  whatsapp_status=case when excluded.whatsapp_declared then 'declared' else 'unknown' end,preferred_channel=excluded.preferred_channel,
  service_consented_at=case when p_service_consent then coalesce(public.user_communication_preferences.service_consented_at,now()) else public.user_communication_preferences.service_consented_at end,
  service_revoked_at=case when p_service_consent then null when public.user_communication_preferences.service_consented_at is not null then coalesce(public.user_communication_preferences.service_revoked_at,now()) end,
  marketing_consented_at=case when p_marketing_consent and not changed then coalesce(public.user_communication_preferences.marketing_consented_at,now()) end,
  marketing_revoked_at=case when (not p_marketing_consent or changed) and public.user_communication_preferences.marketing_consented_at is not null then coalesce(public.user_communication_preferences.marketing_revoked_at,now()) end,
  consent_source=trim(p_consent_source),consent_version=trim(p_consent_version),updated_at=now();
 insert into public.personal_whatsapp_consent_events(user_id,action,consent_source,consent_version) values(actor,case when changed then 'number_changed' else 'preferences_saved' end,trim(p_consent_source),trim(p_consent_version));
 return jsonb_build_object('saved',true,'whatsappStatus',case when p_whatsapp_declared then 'declared' else 'unknown' end);
end; $$;

create or replace function public.submit_partner_application_v2(p_name text,p_email text,p_partner_type text,p_locale text,p_motivation text,p_terms_version text,p_status_token_hash text,p_submitter_fingerprint text,
 p_country_code text,p_calling_code text,p_national_number text,p_phone_e164 text,p_whatsapp_declared boolean,p_preferred_channel text,p_service_consent boolean,p_marketing_consent boolean,p_consent_version text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; application_id uuid;
begin
 perform private.assert_supported_whatsapp_phone(p_country_code,p_calling_code,p_national_number,p_phone_e164);
 if p_whatsapp_declared is null or p_service_consent is null or p_marketing_consent is null or p_preferred_channel not in ('email','whatsapp') or (p_preferred_channel='whatsapp' and (not p_whatsapp_declared or not p_service_consent)) or char_length(coalesce(trim(p_consent_version),'')) not between 2 and 80 then raise exception 'invalid_whatsapp_preferences' using errcode='22023'; end if;
 result:=public.submit_partner_application(p_name,p_email,p_partner_type,p_locale,p_motivation,p_terms_version,p_status_token_hash,p_submitter_fingerprint); application_id:=(result->>'applicationId')::uuid;
 insert into public.partner_application_communication_preferences(application_id,country_code,calling_code,national_number,phone_e164,whatsapp_declared,whatsapp_status,preferred_channel,service_consented_at,marketing_consented_at,consent_source,consent_version)
 values(application_id,p_country_code,p_calling_code,p_national_number,p_phone_e164,p_whatsapp_declared,case when p_whatsapp_declared then 'declared' else 'unknown' end,p_preferred_channel,case when p_service_consent then now() end,case when p_marketing_consent then now() end,'partner_application',trim(p_consent_version));
 insert into public.personal_whatsapp_consent_events(partner_application_id,action,consent_source,consent_version) values(application_id,'preferences_saved','partner_application',trim(p_consent_version)); return result;
end; $$;

revoke all on function public.save_tenant_whatsapp_preferences_v2(uuid,text,text,text,text,boolean,text,boolean,boolean,text,text) from public,anon;
revoke all on function public.prepare_manual_whatsapp_handoff(uuid) from public,anon;
revoke all on function public.set_my_tenant_whatsapp_status(uuid,text,text) from public,anon;
revoke all on function public.get_my_whatsapp_preferences() from public,anon;
revoke all on function public.save_my_whatsapp_preferences(text,text,text,text,boolean,text,boolean,boolean,text,text) from public,anon;
revoke all on function public.submit_partner_application_v2(text,text,text,text,text,text,text,text,text,text,text,text,boolean,text,boolean,boolean,text) from public,authenticated;
grant execute on function public.save_tenant_whatsapp_preferences_v2(uuid,text,text,text,text,boolean,text,boolean,boolean,text,text) to authenticated;
grant execute on function public.prepare_manual_whatsapp_handoff(uuid) to authenticated;
grant execute on function public.set_my_tenant_whatsapp_status(uuid,text,text) to authenticated;
grant execute on function public.get_my_whatsapp_preferences() to authenticated;
grant execute on function public.save_my_whatsapp_preferences(text,text,text,text,boolean,text,boolean,boolean,text,text) to authenticated;
grant execute on function public.submit_partner_application_v2(text,text,text,text,text,text,text,text,text,text,text,text,boolean,text,boolean,boolean,text) to anon;

commit;
