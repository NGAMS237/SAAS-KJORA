-- Lot 6F — contracts, controlled templates, simple signatures and visual stamp.
-- Local gate only. This migration does not send email, backfill data or expose public files.

begin;

alter table public.role_capabilities drop constraint role_capabilities_capability_check;
alter table public.role_capabilities add constraint role_capabilities_capability_check check (capability in (
  'organization.view', 'organization.profile.manage', 'member.view', 'member.manage',
  'property.view', 'property.manage', 'unit.view', 'unit.manage', 'tenant.view', 'tenant.manage',
  'lease.view', 'lease.manage', 'due.view', 'payment.view', 'payment.record',
  'payment.correct', 'payment.correction.request', 'receipt.view', 'receipt.share', 'activity.view', 'audit.view',
  'tenant_portal.manage', 'contract.manage'
));
insert into public.role_capabilities (role, capability) values
  ('organization_owner', 'contract.manage'), ('manager', 'contract.manage')
on conflict do nothing;

create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  family_key text not null check (family_key ~ '^[a-z0-9][a-z0-9_-]{2,79}$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  language text not null check (language in ('fr', 'en')),
  version integer not null check (version > 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  is_system boolean not null default false,
  is_default boolean not null default false,
  source_template_id uuid references public.contract_templates (id) on delete restrict,
  sections jsonb not null check (jsonb_typeof(sections) = 'array' and jsonb_array_length(sections) between 1 and 40),
  created_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint contract_templates_scope check (
    (is_system and organization_id is null and created_by is null)
    or (not is_system and organization_id is not null and created_by is not null)
  ),
  constraint contract_templates_org_id_key unique (organization_id, id),
  constraint contract_templates_family_version_key unique (organization_id, family_key, language, version)
);
create unique index contract_templates_system_version_idx
  on public.contract_templates (family_key, language, version) where is_system;
create unique index contract_templates_default_org_idx
  on public.contract_templates (organization_id, language) where is_default and status = 'active';
create unique index contract_templates_default_system_idx
  on public.contract_templates (language) where is_system and is_default and status = 'active';
create index contract_templates_org_active_idx
  on public.contract_templates (organization_id, language, status, created_at desc);
create index contract_templates_source_idx on public.contract_templates (source_template_id) where source_template_id is not null;
create index contract_templates_created_by_idx on public.contract_templates (created_by) where created_by is not null;

insert into public.contract_templates (
  family_key, name, language, version, is_system, is_default, sections
) values
('residential-standard', 'Bail résidentiel standard', 'fr', 1, true, true, jsonb_build_array(
  jsonb_build_object('key','object','title','Objet','condition','always','body','Le présent contrat porte sur le logement {{unit.label}} du bien {{property.name}}, situé à {{property.locality}}.'),
  jsonb_build_object('key','duration','title','Durée','condition','always','body','Le bail prend effet le {{lease.start_date}}{{lease.end_date_sentence}}.'),
  jsonb_build_object('key','rent','title','Loyer','condition','always','body','Le loyer est de {{lease.base_rent}} {{organization.currency}} par période {{lease.frequency}}. Il est exigible le {{lease.due_day}}.'),
  jsonb_build_object('key','charges','title','Charges','condition','charges_positive','body','Les charges périodiques sont de {{lease.charges}} {{organization.currency}}.'),
  jsonb_build_object('key','deposit','title','Dépôt de garantie','condition','deposit_positive','body','Le dépôt de garantie est fixé à {{lease.deposit}} {{organization.currency}}.'),
  jsonb_build_object('key','initial_payment','title','Encaissement initial','condition','initial_payment_positive','body','L’encaissement initial déclaré à l’activation est de {{lease.initial_payment}} {{organization.currency}}.'),
  jsonb_build_object('key','electricity','title','Électricité et services','condition','always','body','Les consommations d’électricité et services individualisés sont traitées selon les relevés et modalités convenus par les parties.'),
  jsonb_build_object('key','payment','title','Modalités de paiement','condition','payment_terms_present','body','{{lease.payment_terms}}'),
  jsonb_build_object('key','arrears','title','Retards et impayés','condition','always','body','Tout retard est suivi selon les règles applicables et les écritures KJORA, sans modification silencieuse.'),
  jsonb_build_object('key','inventory','title','État des lieux','condition','always','body','Un état des lieux peut être établi séparément par les parties.'),
  jsonb_build_object('key','termination','title','Fin du bail','condition','always','body','La fin du bail fait l’objet d’une clôture explicite et traçable.'),
  jsonb_build_object('key','signatures','title','Consentement et signatures','condition','always','body','Les parties déclarent avoir lu et accepté la version exacte du présent contrat.')
)),
('residential-standard', 'Standard residential lease', 'en', 1, true, true, jsonb_build_array(
  jsonb_build_object('key','object','title','Purpose','condition','always','body','This agreement covers unit {{unit.label}} at {{property.name}}, located in {{property.locality}}.'),
  jsonb_build_object('key','duration','title','Term','condition','always','body','The lease starts on {{lease.start_date}}{{lease.end_date_sentence}}.'),
  jsonb_build_object('key','rent','title','Rent','condition','always','body','Rent is {{lease.base_rent}} {{organization.currency}} per {{lease.frequency}} period and is due on day {{lease.due_day}}.'),
  jsonb_build_object('key','charges','title','Charges','condition','charges_positive','body','Recurring charges are {{lease.charges}} {{organization.currency}}.'),
  jsonb_build_object('key','deposit','title','Security deposit','condition','deposit_positive','body','The security deposit is {{lease.deposit}} {{organization.currency}}.'),
  jsonb_build_object('key','initial_payment','title','Initial payment','condition','initial_payment_positive','body','The initial amount declared at activation is {{lease.initial_payment}} {{organization.currency}}.'),
  jsonb_build_object('key','electricity','title','Electricity and services','condition','always','body','Individual electricity and service consumption is handled according to readings and terms agreed by the parties.'),
  jsonb_build_object('key','payment','title','Payment terms','condition','payment_terms_present','body','{{lease.payment_terms}}'),
  jsonb_build_object('key','arrears','title','Late payment','condition','always','body','Late payment is tracked according to applicable rules and KJORA records, without silent changes.'),
  jsonb_build_object('key','inventory','title','Condition report','condition','always','body','The parties may establish a separate condition report.'),
  jsonb_build_object('key','termination','title','Lease end','condition','always','body','Ending the lease requires an explicit, traceable closure.'),
  jsonb_build_object('key','signatures','title','Consent and signatures','condition','always','body','The parties confirm that they have read and accepted this exact contract version.')
));

create table public.organization_contract_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  stamp_enabled boolean not null default true,
  stamp_name text check (stamp_name is null or char_length(trim(stamp_name)) between 2 and 120),
  stamp_company text check (stamp_company is null or char_length(trim(stamp_company)) between 2 and 120),
  stamp_phone text check (stamp_phone is null or char_length(trim(stamp_phone)) between 6 and 32),
  stamp_short_address text check (stamp_short_address is null or char_length(trim(stamp_short_address)) between 2 and 180),
  stamp_position text not null default 'signature_block' check (stamp_position in ('signature_block','footer')),
  updated_by uuid not null references auth.users (id) on delete restrict,
  updated_at timestamptz not null default now()
);
create index organization_contract_settings_updated_by_idx on public.organization_contract_settings (updated_by);

create table public.lease_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  lease_id uuid not null,
  tenant_id uuid not null,
  template_id uuid not null references public.contract_templates (id) on delete restrict,
  template_version integer not null check (template_version > 0),
  language text not null check (language in ('fr','en')),
  reference text not null check (char_length(reference) between 8 and 80),
  status text not null default 'draft' check (status in ('draft','ready','owner_signed','sent','tenant_signed','completed','cancelled')),
  template_snapshot jsonb not null check (jsonb_typeof(template_snapshot) = 'object'),
  data_snapshot jsonb not null check (jsonb_typeof(data_snapshot) = 'object'),
  content_snapshot jsonb not null check (jsonb_typeof(content_snapshot) = 'array'),
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  stamp_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(stamp_snapshot) = 'object'),
  final_storage_path text,
  final_sha256 text check (final_sha256 is null or final_sha256 ~ '^[0-9a-f]{64}$'),
  final_bytes integer check (final_bytes is null or final_bytes > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  validated_by uuid references auth.users (id) on delete restrict,
  validated_at timestamptz,
  sent_by uuid references auth.users (id) on delete restrict,
  sent_at timestamptz,
  completed_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete restrict,
  cancelled_at timestamptz,
  cancellation_reason text check (cancellation_reason is null or char_length(trim(cancellation_reason)) between 3 and 500),
  constraint lease_contracts_org_id_key unique (organization_id, id),
  constraint lease_contracts_org_tenant_key unique (organization_id, id, tenant_id),
  constraint lease_contracts_lease_fk foreign key (organization_id, lease_id, tenant_id)
    references public.leases (organization_id, id, tenant_id) on delete restrict,
  constraint lease_contracts_final_state check (
    (status = 'completed' and final_storage_path is not null and final_sha256 is not null and final_bytes is not null and completed_at is not null)
    or status <> 'completed'
  )
);
create unique index lease_contracts_live_lease_idx on public.lease_contracts (organization_id, lease_id)
  where status <> 'cancelled';
create unique index lease_contracts_reference_idx on public.lease_contracts (organization_id, reference);
create index lease_contracts_tenant_idx on public.lease_contracts (organization_id, tenant_id, created_at desc);
create index lease_contracts_status_idx on public.lease_contracts (organization_id, status, created_at desc);
create index lease_contracts_template_idx on public.lease_contracts (template_id);
create index lease_contracts_created_by_idx on public.lease_contracts (created_by);
create index lease_contracts_validated_by_idx on public.lease_contracts (validated_by) where validated_by is not null;
create index lease_contracts_sent_by_idx on public.lease_contracts (sent_by) where sent_by is not null;
create index lease_contracts_cancelled_by_idx on public.lease_contracts (cancelled_by) where cancelled_by is not null;

create table public.contract_signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contract_id uuid not null,
  tenant_id uuid not null,
  lease_id uuid not null,
  party text not null check (party in ('owner','tenant')),
  signer_user_id uuid not null references auth.users (id) on delete restrict,
  tenant_portal_access_id uuid,
  method text not null check (method in ('drawn','stylized_name')),
  signature_data jsonb not null check (jsonb_typeof(signature_data) = 'object'),
  consent_code text not null check (char_length(consent_code) between 3 and 100),
  consent_text text not null check (char_length(consent_text) between 8 and 500),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  signed_at timestamptz not null default now(),
  constraint contract_signatures_party_key unique (contract_id, party),
  constraint contract_signatures_contract_fk foreign key (organization_id, contract_id, tenant_id)
    references public.lease_contracts (organization_id, id, tenant_id) on delete restrict,
  constraint contract_signatures_lease_fk foreign key (organization_id, lease_id, tenant_id)
    references public.leases (organization_id, id, tenant_id) on delete restrict,
  constraint contract_signatures_portal_scope check (
    (party = 'owner' and tenant_portal_access_id is null)
    or (party = 'tenant' and tenant_portal_access_id is not null)
  ),
  constraint contract_signatures_portal_fk foreign key (organization_id, tenant_portal_access_id, tenant_id)
    references public.tenant_portal_accesses (organization_id, id, tenant_id) on delete restrict
);
create index contract_signatures_signer_idx on public.contract_signatures (signer_user_id, signed_at desc);
create index contract_signatures_portal_idx on public.contract_signatures (tenant_portal_access_id) where tenant_portal_access_id is not null;
create index contract_signatures_contract_scope_idx on public.contract_signatures (organization_id, contract_id, tenant_id);
create index contract_signatures_lease_scope_idx on public.contract_signatures (organization_id, lease_id, tenant_id);

create table public.contract_amendments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contract_id uuid not null,
  status text not null default 'draft' check (status in ('draft','cancelled')),
  summary text not null check (char_length(trim(summary)) between 3 and 500),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint contract_amendments_contract_fk foreign key (organization_id, contract_id)
    references public.lease_contracts (organization_id, id) on delete restrict
);
create index contract_amendments_contract_idx on public.contract_amendments (organization_id, contract_id);
create index contract_amendments_created_by_idx on public.contract_amendments (created_by);

alter table public.administrative_audit_log add column contract_id uuid;
alter table public.administrative_audit_log add constraint administrative_audit_contract_fk
  foreign key (organization_id, contract_id) references public.lease_contracts (organization_id, id) on delete restrict;
create index administrative_audit_contract_idx on public.administrative_audit_log (organization_id, contract_id, created_at desc)
  where contract_id is not null;
alter table public.administrative_audit_log drop constraint administrative_audit_log_action_check;
alter table public.administrative_audit_log add constraint administrative_audit_log_action_check check (action in (
  'member.invited','member.invitation_resent','member.invitation_revoked','member.invitation_accepted',
  'member.role_changed','member.revoked','owner.transferred','payment.reversed','document.invalidated',
  'tenant_portal.invited','tenant_portal.invitation_resent','tenant_portal.invitation_accepted',
  'tenant_portal.revoked','tenant_portal.reactivated','contract.generated','contract.validated',
  'contract.owner_signed','contract.sent','contract.tenant_viewed','contract.tenant_signed',
  'contract.finalized','contract.cancelled'
));

alter table public.notifications drop constraint notifications_required_capability_check;
alter table public.notifications add constraint notifications_required_capability_check
  check (required_capability in ('due.view','payment.view','receipt.view','contract.manage'));
alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (notification_type in (
  'due_notice_ready','payment_receipt_ready','rent_receipt_ready','payment_overdue','last_prepaid_period',
  'low_credit','delivery_failed','contract_ready','contract_completed'
));

alter table public.contract_templates enable row level security;
alter table public.organization_contract_settings enable row level security;
alter table public.lease_contracts enable row level security;
alter table public.contract_signatures enable row level security;
alter table public.contract_amendments enable row level security;

revoke all on public.contract_templates, public.organization_contract_settings, public.lease_contracts,
  public.contract_signatures, public.contract_amendments from public, anon, authenticated;

create or replace function private.valid_contract_sections(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(value)<>'array' or jsonb_array_length(value) not between 1 and 40 then return false; end if;
  return not exists (
    select 1 from jsonb_array_elements(value) section where
      coalesce(section->>'key','') !~ '^[a-z0-9_-]{2,80}$'
      or char_length(coalesce(section->>'title','')) not between 1 and 160
      or char_length(coalesce(section->>'body','')) not between 1 and 4000
      or coalesce(section->>'condition','') not in ('always','deposit_positive','charges_positive','initial_payment_positive','end_date_present','payment_terms_present')
      or regexp_replace(section->>'body', '\{\{\s*(organization\.(name|currency)|lessor\.(displayName|phone|address)|tenant\.(name|email|phone)|property\.(name|locality)|unit\.label|lease\.(start_date|end_date_sentence|base_rent|charges|deposit|frequency|due_day|initial_payment|payment_terms))\s*\}\}', '', 'g') ~ '\{\{'
  );
end;
$$;
alter table public.contract_templates add constraint contract_templates_controlled_sections
  check (private.valid_contract_sections(sections));

create or replace function private.protect_lease_contract_integrity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status in ('completed','cancelled') then raise exception 'immutable_contract' using errcode='23514'; end if;
  if row(old.organization_id,old.lease_id,old.tenant_id,old.template_id,old.template_version,old.language,old.reference,old.template_snapshot,old.data_snapshot,old.stamp_snapshot,old.created_by,old.created_at)
    is distinct from row(new.organization_id,new.lease_id,new.tenant_id,new.template_id,new.template_version,new.language,new.reference,new.template_snapshot,new.data_snapshot,new.stamp_snapshot,new.created_by,new.created_at)
  then raise exception 'immutable_contract_snapshot' using errcode='23514'; end if;
  if not ((old.status='draft' and new.status in ('ready','cancelled'))
    or (old.status='ready' and new.status in ('owner_signed','cancelled'))
    or (old.status='owner_signed' and new.status in ('sent','cancelled'))
    or (old.status='sent' and new.status in ('tenant_signed','cancelled'))
    or (old.status='tenant_signed' and new.status in ('completed','cancelled')))
  then raise exception 'invalid_contract_transition' using errcode='23514'; end if;
  if old.status <> 'draft' and old.content_snapshot is distinct from new.content_snapshot then
    raise exception 'immutable_contract_content' using errcode='23514';
  end if;
  if old.status <> 'draft' and old.content_sha256 is distinct from new.content_sha256 then
    raise exception 'immutable_contract_hash' using errcode='23514';
  end if;
  if new.status <> 'completed' and row(old.final_storage_path,old.final_sha256,old.final_bytes,old.completed_at)
    is distinct from row(new.final_storage_path,new.final_sha256,new.final_bytes,new.completed_at) then
    raise exception 'premature_contract_artifact' using errcode='23514';
  end if;
  return new;
end; $$;
create trigger lease_contracts_protect_integrity before update on public.lease_contracts
for each row execute function private.protect_lease_contract_integrity();

create or replace function private.protect_contract_signature()
returns trigger language plpgsql security definer set search_path = '' as $$
begin raise exception 'immutable_contract_signature' using errcode='23514'; end; $$;
create trigger contract_signatures_immutable before update or delete on public.contract_signatures
for each row execute function private.protect_contract_signature();

create or replace function private.write_contract_audit(
  target_contract_id uuid, target_action text, target_details jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare selected_contract public.lease_contracts%rowtype;
begin
  select * into selected_contract from public.lease_contracts where id = target_contract_id;
  insert into public.administrative_audit_log (
    organization_id, actor_user_id, action, contract_id, details
  ) values (
    selected_contract.organization_id, (select auth.uid()), target_action, selected_contract.id,
    coalesce(target_details, '{}'::jsonb)
  );
end; $$;

create or replace function private.contract_reference(target_organization_id uuid)
returns text language sql volatile security definer set search_path = '' as $$
  select 'CTR-' || to_char(current_date, 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
$$;

create or replace function public.list_contract_templates(target_organization_id uuid, target_language text default null)
returns table (template_id uuid, organization_id uuid, family_key text, name text, language text, version integer,
  status text, is_system boolean, is_default boolean, sections jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.has_capability(target_organization_id, 'contract.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query select t.id,t.organization_id,t.family_key,t.name,t.language,t.version,t.status,t.is_system,t.is_default,t.sections,t.created_at
    from public.contract_templates t where (t.is_system or t.organization_id = target_organization_id)
      and t.status = 'active' and (target_language is null or t.language = target_language)
    order by t.language, t.is_default desc, t.is_system asc, t.name, t.version desc;
end; $$;

create or replace function public.list_contract_template_history(target_organization_id uuid)
returns table (template_id uuid,family_key text,name text,language text,version integer,status text,is_system boolean,is_default boolean,source_template_id uuid,sections jsonb,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.has_capability(target_organization_id,'contract.manage')) then raise exception 'forbidden' using errcode='42501'; end if;
  return query select t.id,t.family_key,t.name,t.language,t.version,t.status,t.is_system,t.is_default,t.source_template_id,t.sections,t.created_at
    from public.contract_templates t where t.is_system or t.organization_id=target_organization_id
    order by t.language,t.family_key,t.version desc;
end; $$;

create or replace function public.duplicate_contract_template(target_organization_id uuid,target_template_id uuid,target_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare source public.contract_templates%rowtype; new_id uuid;
begin
  if not (select private.has_capability(target_organization_id,'contract.manage')) then raise exception 'forbidden' using errcode='42501'; end if;
  select * into source from public.contract_templates where id=target_template_id and (is_system or organization_id=target_organization_id);
  if source.id is null or char_length(trim(target_name)) not between 2 and 120 then raise exception 'invalid_template' using errcode='22023'; end if;
  insert into public.contract_templates (organization_id,family_key,name,language,version,status,is_system,is_default,source_template_id,sections,created_by)
    values (target_organization_id,'custom-'||replace(gen_random_uuid()::text,'-',''),trim(target_name),source.language,1,'active',false,false,source.id,source.sections,auth.uid())
    returning id into new_id;
  return new_id;
end; $$;

create or replace function public.create_contract_template_version(target_template_id uuid,target_name text,target_sections jsonb,target_make_default boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare source public.contract_templates%rowtype; new_id uuid;
begin
  select * into source from public.contract_templates where id=target_template_id and not is_system and status='active';
  if source.id is null or not (select private.has_capability(source.organization_id,'contract.manage')) then raise exception 'not_found' using errcode='42501'; end if;
  if char_length(trim(target_name)) not between 2 and 120 or not (select private.valid_contract_sections(target_sections)) then
    raise exception 'invalid_template' using errcode='22023';
  end if;
  update public.contract_templates set status='inactive',is_default=false where organization_id=source.organization_id and family_key=source.family_key and status='active';
  if target_make_default then update public.contract_templates set is_default=false where organization_id=source.organization_id and language=source.language; end if;
  insert into public.contract_templates (organization_id,family_key,name,language,version,status,is_system,is_default,source_template_id,sections,created_by)
    values (source.organization_id,source.family_key,trim(target_name),source.language,source.version+1,'active',false,target_make_default,source.id,target_sections,auth.uid()) returning id into new_id;
  return new_id;
end; $$;

create or replace function public.get_organization_contract_settings(target_organization_id uuid)
returns table (stamp_enabled boolean,stamp_name text,stamp_company text,stamp_phone text,stamp_short_address text,stamp_position text,updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.has_capability(target_organization_id,'contract.manage')) then raise exception 'forbidden' using errcode='42501'; end if;
  return query select coalesce(s.stamp_enabled,true),s.stamp_name,s.stamp_company,s.stamp_phone,s.stamp_short_address,coalesce(s.stamp_position,'signature_block'),s.updated_at
    from (select 1) seed left join public.organization_contract_settings s on s.organization_id=target_organization_id;
end; $$;

create or replace function public.save_organization_contract_settings(target_organization_id uuid,target_enabled boolean,target_name text,target_company text,target_phone text,target_address text,target_position text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.has_capability(target_organization_id,'contract.manage')) then raise exception 'forbidden' using errcode='42501'; end if;
  insert into public.organization_contract_settings (organization_id,stamp_enabled,stamp_name,stamp_company,stamp_phone,stamp_short_address,stamp_position,updated_by)
    values (target_organization_id,target_enabled,nullif(trim(target_name),''),nullif(trim(target_company),''),nullif(trim(target_phone),''),nullif(trim(target_address),''),target_position,auth.uid())
  on conflict (organization_id) do update set stamp_enabled=excluded.stamp_enabled,stamp_name=excluded.stamp_name,stamp_company=excluded.stamp_company,
    stamp_phone=excluded.stamp_phone,stamp_short_address=excluded.stamp_short_address,stamp_position=excluded.stamp_position,updated_by=auth.uid(),updated_at=now();
  return target_organization_id;
end; $$;

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

create or replace function public.get_lease_contracts(target_organization_id uuid, target_lease_id uuid)
returns setof public.lease_contracts language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.has_capability(target_organization_id,'contract.manage')) then raise exception 'forbidden' using errcode='42501'; end if;
  return query select c.* from public.lease_contracts c where c.organization_id=target_organization_id and c.lease_id=target_lease_id order by c.created_at desc;
end; $$;

create or replace function public.get_lease_contract(target_organization_id uuid, target_contract_id uuid)
returns setof public.lease_contracts language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.has_capability(target_organization_id,'contract.manage')) then raise exception 'forbidden' using errcode='42501'; end if;
  return query select c.* from public.lease_contracts c where c.organization_id=target_organization_id and c.id=target_contract_id;
end; $$;

create or replace function public.validate_lease_contract(target_contract_id uuid, target_content jsonb, target_sha256 text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.lease_contracts%rowtype;
begin
  select * into c from public.lease_contracts where id=target_contract_id for update;
  if c.id is null or not (select private.has_capability(c.organization_id,'contract.manage')) then raise exception 'not_found' using errcode='42501'; end if;
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

create or replace function public.sign_lease_contract_owner(target_contract_id uuid,target_method text,target_signature jsonb,target_consent_text text,target_sha256 text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.lease_contracts%rowtype; signature_id uuid;
begin
  select * into c from public.lease_contracts where id=target_contract_id for update;
  if c.id is null or not (select private.has_capability(c.organization_id,'contract.manage')) then raise exception 'not_found' using errcode='42501'; end if;
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

create or replace function public.send_lease_contract(target_contract_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.lease_contracts%rowtype; access_id uuid;
begin
  select * into c from public.lease_contracts where id=target_contract_id for update;
  if c.id is null or not (select private.has_capability(c.organization_id,'contract.manage')) then raise exception 'not_found' using errcode='42501'; end if;
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

create or replace function public.list_my_tenant_portal_contracts(target_access_id uuid,target_lease_id uuid default null)
returns table (contract_id uuid,lease_id uuid,reference text,status text,language text,content_sha256 text,final_storage_path text,created_at timestamptz,sent_at timestamptz,completed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.has_active_tenant_portal_access(target_access_id)) then raise exception 'not_found' using errcode='42501'; end if;
  return query select c.id,c.lease_id,c.reference,c.status,c.language,c.content_sha256,c.final_storage_path,c.created_at,c.sent_at,c.completed_at
    from public.lease_contracts c join public.tenant_portal_lease_accesses la
      on la.organization_id=c.organization_id and la.lease_id=c.lease_id and la.tenant_id=c.tenant_id
    where la.access_id=target_access_id and c.status in ('sent','tenant_signed','completed')
      and (target_lease_id is null or c.lease_id=target_lease_id) order by c.created_at desc;
end; $$;

create or replace function public.get_my_tenant_portal_contract(target_access_id uuid,target_contract_id uuid)
returns setof public.lease_contracts language plpgsql security definer set search_path = '' as $$
declare c public.lease_contracts%rowtype;
begin
  if not (select private.has_active_tenant_portal_access(target_access_id)) then raise exception 'not_found' using errcode='42501'; end if;
  select contract.* into c from public.lease_contracts contract join public.tenant_portal_lease_accesses la
    on la.organization_id=contract.organization_id and la.lease_id=contract.lease_id and la.tenant_id=contract.tenant_id
    where contract.id=target_contract_id and la.access_id=target_access_id and contract.status in ('sent','tenant_signed','completed');
  if c.id is null then raise exception 'not_found' using errcode='42501'; end if;
  if not exists(select 1 from public.administrative_audit_log a where a.contract_id=c.id and a.actor_user_id=auth.uid() and a.action='contract.tenant_viewed') then
    perform private.write_contract_audit(c.id,'contract.tenant_viewed',jsonb_build_object('access_id',target_access_id));
  end if;
  return next c;
end; $$;

create or replace function public.sign_lease_contract_tenant(target_access_id uuid,target_contract_id uuid,target_method text,target_signature jsonb,target_consent_text text,target_sha256 text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.lease_contracts%rowtype; a public.tenant_portal_accesses%rowtype; signature_id uuid;
begin
  if not (select private.has_active_tenant_portal_access(target_access_id)) then raise exception 'not_found' using errcode='42501'; end if;
  select * into a from public.tenant_portal_accesses where id=target_access_id;
  select contract.* into c from public.lease_contracts contract join public.tenant_portal_lease_accesses la
    on la.organization_id=contract.organization_id and la.lease_id=contract.lease_id and la.tenant_id=contract.tenant_id
    where contract.id=target_contract_id and la.access_id=a.id for update of contract;
  if c.id is null or c.status <> 'sent' or c.content_sha256 <> target_sha256 or target_method not in ('drawn','stylized_name')
    or jsonb_typeof(target_signature)<>'object' or pg_column_size(target_signature)>100000
    or (target_method='stylized_name' and char_length(trim(coalesce(target_signature->>'displayName',''))) not between 2 and 120)
    or (target_method='drawn' and (jsonb_typeof(target_signature->'strokes')<>'array' or jsonb_array_length(target_signature->'strokes') not between 2 and 1000))
    or char_length(trim(target_consent_text)) not between 8 and 500 then raise exception 'invalid_contract_state' using errcode='22023'; end if;
  insert into public.contract_signatures (organization_id,contract_id,tenant_id,lease_id,party,signer_user_id,tenant_portal_access_id,method,signature_data,consent_code,consent_text,content_sha256)
    values (c.organization_id,c.id,c.tenant_id,c.lease_id,'tenant',auth.uid(),a.id,target_method,target_signature,'tenant_contract_signature_v1',target_consent_text,target_sha256)
    returning id into signature_id;
  update public.lease_contracts set status='tenant_signed' where id=c.id;
  perform private.write_contract_audit(c.id,'contract.tenant_signed',jsonb_build_object('signature_id',signature_id,'access_id',a.id,'method',target_method)); return signature_id;
end; $$;

create or replace function public.finalize_lease_contract(target_access_id uuid,target_contract_id uuid,target_storage_path text,target_sha256 text,target_bytes integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.lease_contracts%rowtype; portal_allowed boolean;
begin
  select * into c from public.lease_contracts where id=target_contract_id for update;
  portal_allowed := target_access_id is not null and (select private.has_active_tenant_portal_access(target_access_id))
    and exists(select 1 from public.tenant_portal_lease_accesses la where la.access_id=target_access_id and la.organization_id=c.organization_id and la.tenant_id=c.tenant_id and la.lease_id=c.lease_id);
  if c.id is null or (not portal_allowed and not (select private.has_capability(c.organization_id,'contract.manage'))) then raise exception 'not_found' using errcode='42501'; end if;
  if c.status <> 'tenant_signed' or target_storage_path <> c.organization_id||'/'||c.id||'/v1/final.pdf'
    or target_sha256 !~ '^[0-9a-f]{64}$' or target_bytes <= 0 then raise exception 'invalid_contract_finalization' using errcode='22023'; end if;
  update public.lease_contracts set status='completed',final_storage_path=target_storage_path,final_sha256=target_sha256,final_bytes=target_bytes,completed_at=now() where id=c.id;
  perform private.write_contract_audit(c.id,'contract.finalized',jsonb_build_object('final_sha256',target_sha256,'bytes',target_bytes));
  insert into public.notifications (organization_id,recipient_user_id,recipient_tenant_portal_access_id,required_capability,notification_type,deduplication_key,title_code,payload,tenant_id,lease_id)
    select c.organization_id,null,a.id,'contract.manage','contract_completed','contract-completed:'||c.id,'contract.completed',jsonb_build_object('contractId',c.id,'reference',c.reference),c.tenant_id,c.lease_id
    from public.tenant_portal_accesses a where a.id=target_access_id and a.status='active'
    on conflict (organization_id,recipient_tenant_portal_access_id,deduplication_key) where recipient_tenant_portal_access_id is not null do nothing;
  return c.id;
end; $$;

create or replace function public.cancel_lease_contract(target_contract_id uuid,target_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.lease_contracts%rowtype;
begin
  select * into c from public.lease_contracts where id=target_contract_id for update;
  if c.id is null or not (select private.has_capability(c.organization_id,'contract.manage')) then raise exception 'not_found' using errcode='42501'; end if;
  if c.status in ('completed','cancelled') or char_length(trim(target_reason)) not between 3 and 500 then raise exception 'invalid_contract_state' using errcode='22023'; end if;
  update public.lease_contracts set status='cancelled',cancelled_by=auth.uid(),cancelled_at=now(),cancellation_reason=trim(target_reason) where id=c.id;
  perform private.write_contract_audit(c.id,'contract.cancelled',jsonb_build_object('reason',trim(target_reason))); return c.id;
end; $$;

create or replace function public.get_lease_contract_signatures(target_contract_id uuid,target_access_id uuid default null)
returns table (party text,signer_user_id uuid,method text,consent_code text,consent_text text,content_sha256 text,signed_at timestamptz,signature_data jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare c public.lease_contracts%rowtype; portal_allowed boolean;
begin
  select * into c from public.lease_contracts where id=target_contract_id;
  portal_allowed := target_access_id is not null and (select private.has_active_tenant_portal_access(target_access_id))
    and exists(select 1 from public.tenant_portal_lease_accesses la where la.access_id=target_access_id and la.organization_id=c.organization_id and la.tenant_id=c.tenant_id and la.lease_id=c.lease_id);
  if c.id is null or (not portal_allowed and not (select private.has_capability(c.organization_id,'contract.manage'))) then raise exception 'not_found' using errcode='42501'; end if;
  return query select s.party,s.signer_user_id,s.method,s.consent_code,s.consent_text,s.content_sha256,s.signed_at,s.signature_data
    from public.contract_signatures s where s.contract_id=c.id order by s.signed_at,s.party;
end; $$;

create or replace function private.can_access_contract_document_path(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.lease_contracts c
    where c.final_storage_path=object_name and c.status='completed' and (
      (select private.has_capability(c.organization_id,'contract.manage'))
      or exists(select 1 from public.tenant_portal_accesses a join public.tenant_portal_lease_accesses la
        on la.organization_id=a.organization_id and la.access_id=a.id and la.tenant_id=a.tenant_id
        where a.user_id=(select auth.uid()) and a.status='active' and la.lease_id=c.lease_id and la.tenant_id=c.tenant_id
          and (select private.has_active_tenant_portal_access(a.id)))
    )
  );
$$;

create or replace function private.can_write_contract_document_path(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.lease_contracts c where object_name=c.organization_id||'/'||c.id||'/v1/final.pdf'
      and c.status='tenant_signed' and (
        (select private.has_capability(c.organization_id,'contract.manage'))
        or exists(select 1 from public.tenant_portal_accesses a join public.tenant_portal_lease_accesses la
          on la.organization_id=a.organization_id and la.access_id=a.id and la.tenant_id=a.tenant_id
          where a.user_id=(select auth.uid()) and a.status='active' and la.lease_id=c.lease_id and la.tenant_id=c.tenant_id
            and (select private.has_active_tenant_portal_access(a.id)))
      )
  );
$$;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('contract-documents','contract-documents',false,10485760,array['application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy contract_documents_select on storage.objects for select to authenticated
  using (bucket_id='contract-documents' and (select private.can_access_contract_document_path(name)));
create policy contract_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id='contract-documents' and (select private.can_write_contract_document_path(name)));

revoke all on function public.list_contract_templates(uuid,text), public.list_contract_template_history(uuid),
  public.duplicate_contract_template(uuid,uuid,text), public.create_contract_template_version(uuid,text,jsonb,boolean),
  public.get_organization_contract_settings(uuid), public.save_organization_contract_settings(uuid,boolean,text,text,text,text,text),
  public.generate_lease_contract(uuid,uuid),
  public.get_lease_contracts(uuid,uuid), public.get_lease_contract(uuid,uuid), public.validate_lease_contract(uuid,jsonb,text),
  public.sign_lease_contract_owner(uuid,text,jsonb,text,text), public.send_lease_contract(uuid),
  public.list_my_tenant_portal_contracts(uuid,uuid), public.get_my_tenant_portal_contract(uuid,uuid),
  public.sign_lease_contract_tenant(uuid,uuid,text,jsonb,text,text), public.finalize_lease_contract(uuid,uuid,text,text,integer),
  public.cancel_lease_contract(uuid,text), public.get_lease_contract_signatures(uuid,uuid) from public, anon;
grant execute on function public.list_contract_templates(uuid,text), public.list_contract_template_history(uuid),
  public.duplicate_contract_template(uuid,uuid,text), public.create_contract_template_version(uuid,text,jsonb,boolean),
  public.get_organization_contract_settings(uuid), public.save_organization_contract_settings(uuid,boolean,text,text,text,text,text),
  public.generate_lease_contract(uuid,uuid),
  public.get_lease_contracts(uuid,uuid), public.get_lease_contract(uuid,uuid), public.validate_lease_contract(uuid,jsonb,text),
  public.sign_lease_contract_owner(uuid,text,jsonb,text,text), public.send_lease_contract(uuid),
  public.list_my_tenant_portal_contracts(uuid,uuid), public.get_my_tenant_portal_contract(uuid,uuid),
  public.sign_lease_contract_tenant(uuid,uuid,text,jsonb,text,text), public.finalize_lease_contract(uuid,uuid,text,text,integer),
  public.cancel_lease_contract(uuid,text), public.get_lease_contract_signatures(uuid,uuid) to authenticated;

revoke all on function private.write_contract_audit(uuid,text,jsonb), private.contract_reference(uuid),
  private.can_access_contract_document_path(text) from public, anon, authenticated;
revoke all on function private.can_write_contract_document_path(text) from public, anon, authenticated;
revoke all on function private.protect_lease_contract_integrity(), private.protect_contract_signature() from public, anon, authenticated;
revoke all on function private.valid_contract_sections(jsonb) from public, anon, authenticated;

commit;
