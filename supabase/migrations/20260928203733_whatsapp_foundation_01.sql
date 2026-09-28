begin;

alter table private.domain_events drop constraint domain_events_event_type_check;
alter table private.domain_events add constraint domain_events_event_type_check check (event_type in (
  'PROPERTY_CREATED', 'TENANT_CREATED', 'LEASE_ACTIVATED', 'LEASE_LEDGER_OPENED', 'DUE_GENERATED', 'DUE_ADJUSTED',
  'PAYMENT_RECORDED', 'PAYMENT_COMPLETED', 'PAYMENT_ALLOCATION_CONFIRMED', 'PAYMENT_REVERSED',
  'DOCUMENT_GENERATED', 'DOCUMENT_INVALIDATED', 'MESSAGE_DELIVERY_FAILED', 'FINANCIAL_DOCUMENT_REVIEWED',
  'WHATSAPP_PREFERENCES_CHANGED'
));

create table public.tenant_communication_preferences (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_capable boolean not null default false,
  preferred_channel text not null default 'in_app' check (preferred_channel in ('in_app','email','whatsapp')),
  whatsapp_transactional_consented_at timestamptz,
  whatsapp_transactional_revoked_at timestamptz,
  whatsapp_marketing_consented_at timestamptz,
  whatsapp_marketing_revoked_at timestamptz,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, tenant_id) references public.tenants(organization_id,id) on delete cascade,
  check (not whatsapp_capable or phone_e164 is not null),
  check (preferred_channel <> 'whatsapp' or (whatsapp_capable and phone_e164 is not null)),
  check (whatsapp_transactional_revoked_at is null or whatsapp_transactional_consented_at is not null),
  check (whatsapp_marketing_revoked_at is null or whatsapp_marketing_consented_at is not null)
);

create table public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null check (template_key ~ '^[a-z0-9_]{3,80}$'),
  language text not null check (language in ('fr','en')),
  version integer not null check (version > 0),
  category text not null check (category in ('transactional','marketing')),
  body_template text not null check (char_length(body_template) between 1 and 1600),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  unique(template_key,language,version)
);

create table public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  template_id uuid not null references public.whatsapp_templates(id) on delete restrict,
  recipient_fingerprint text not null check (recipient_fingerprint ~ '^[a-f0-9]{64}$'),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 255),
  status text not null default 'blocked_configuration' check (status in (
    'queued','blocked_configuration','claimed','sent','provider_failed','delivery_unknown','delivered'
  )),
  provider text not null default 'disabled' check (provider = 'disabled'),
  provider_message_ref text,
  claimed_at timestamptz,
  claim_token uuid,
  sent_at timestamptz,
  delivered_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,idempotency_key),
  foreign key (organization_id,tenant_id) references public.tenants(organization_id,id) on delete restrict,
  check ((status='claimed')=(claim_token is not null and claimed_at is not null))
);

alter table public.tenant_communication_preferences enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.whatsapp_outbox enable row level security;
revoke all on public.tenant_communication_preferences, public.whatsapp_templates, public.whatsapp_outbox from public, anon, authenticated;
grant select,insert,update on public.whatsapp_outbox to service_role;
grant select on public.whatsapp_templates to service_role;

create or replace function public.save_tenant_whatsapp_preferences(
  target_tenant_id uuid, p_phone_e164 text, p_whatsapp_capable boolean,
  p_preferred_channel text, p_transactional_consent boolean, p_marketing_consent boolean
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant public.tenants%rowtype;
begin
  select * into tenant from public.tenants where id=target_tenant_id;
  if tenant.id is null or (select auth.uid()) is null
     or not private.has_capability(tenant.organization_id,'tenant.manage') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if p_phone_e164 is not null and p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid_e164' using errcode='22023';
  end if;
  insert into public.tenant_communication_preferences(
    tenant_id,organization_id,phone_e164,whatsapp_capable,preferred_channel,
    whatsapp_transactional_consented_at,whatsapp_transactional_revoked_at,
    whatsapp_marketing_consented_at,whatsapp_marketing_revoked_at,updated_by
  ) values (
    tenant.id,tenant.organization_id,p_phone_e164,coalesce(p_whatsapp_capable,false),p_preferred_channel,
    case when p_transactional_consent then now() end,null,
    case when p_marketing_consent then now() end,null,(select auth.uid())
  ) on conflict(tenant_id) do update set
    phone_e164=excluded.phone_e164,whatsapp_capable=excluded.whatsapp_capable,
    preferred_channel=excluded.preferred_channel,
    whatsapp_transactional_consented_at=case when p_transactional_consent then coalesce(public.tenant_communication_preferences.whatsapp_transactional_consented_at,now()) else public.tenant_communication_preferences.whatsapp_transactional_consented_at end,
    whatsapp_transactional_revoked_at=case
      when p_transactional_consent then null
      when public.tenant_communication_preferences.whatsapp_transactional_consented_at is not null then now()
      else null
    end,
    whatsapp_marketing_consented_at=case when p_marketing_consent then coalesce(public.tenant_communication_preferences.whatsapp_marketing_consented_at,now()) else public.tenant_communication_preferences.whatsapp_marketing_consented_at end,
    whatsapp_marketing_revoked_at=case
      when p_marketing_consent then null
      when public.tenant_communication_preferences.whatsapp_marketing_consented_at is not null then now()
      else null
    end,
    updated_by=(select auth.uid()),updated_at=now();
  insert into private.domain_events(organization_id,event_type,aggregate_type,aggregate_id,actor_user_id,payload)
  values(tenant.organization_id,'WHATSAPP_PREFERENCES_CHANGED','tenant',tenant.id,(select auth.uid()),
    jsonb_build_object('whatsapp_capable',p_whatsapp_capable,'preferred_channel',p_preferred_channel,
      'transactional_consent',p_transactional_consent,'marketing_consent',p_marketing_consent));
  return jsonb_build_object('tenantId',tenant.id,'saved',true);
end;
$$;

create or replace function public.admin_whatsapp_overview()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_platform_admin();
  return jsonb_build_object(
    'provider','disabled',
    'transactionalConsents',(select count(*) from public.tenant_communication_preferences where whatsapp_transactional_consented_at is not null and whatsapp_transactional_revoked_at is null),
    'marketingConsents',(select count(*) from public.tenant_communication_preferences where whatsapp_marketing_consented_at is not null and whatsapp_marketing_revoked_at is null),
    'byStatus',(select coalesce(jsonb_object_agg(status,total),'{}'::jsonb) from (select status,count(*) total from public.whatsapp_outbox group by status) q)
  );
end;
$$;

revoke all on function public.save_tenant_whatsapp_preferences(uuid,text,boolean,text,boolean,boolean) from public,anon;
revoke all on function public.admin_whatsapp_overview() from public,anon;
grant execute on function public.save_tenant_whatsapp_preferences(uuid,text,boolean,text,boolean,boolean) to authenticated;
grant execute on function public.admin_whatsapp_overview() to authenticated;

commit;
