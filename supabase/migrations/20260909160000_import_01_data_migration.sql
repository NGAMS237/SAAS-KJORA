begin;

-- =============================================================================
-- IMPORT-01 — Migration de données (Rentila / CSV / Excel) + situation d'ouverture
-- =============================================================================
-- Objectif : permettre à un propriétaire/gestionnaire existant de reprendre son
-- parc (Biens → Logements → Locataires → Locations) et sa situation financière
-- réelle au jour de la migration, SANS fabriquer un faux historique de Payments.
--
-- Principe d'implémentation : ce lot n'ajoute AUCUNE nouvelle mécanique
-- financière. Il orchestre, via une seule fonction transactionnelle, des
-- INSERT directs dans les tables déjà existantes (properties, units, tenants,
-- leases, dues) en réutilisant EXACTEMENT les primitives déjà en Production :
--   • `leases.initial_prepayment_amount_xaf` → génère automatiquement un
--     `ledger_entries` de type 'opening_credit' (mécanique Lot 6C1, déjà
--     testée), qui couvre les échéances périodiques les plus anciennes
--     d'abord. C'est le véhicule officiel de la "situation d'ouverture" côté
--     loyer (à jour / dette / crédit) — jamais un Payment.
--   • `leases.security_deposit_xaf` → génère automatiquement la Due de dépôt
--     (mécanique Lot 6C1). Si une partie du dépôt a déjà été perçue avant la
--     migration, une Due `kind='adjustment'` (crédit, ciblant cette Due de
--     dépôt) est ajoutée — le même mécanisme déjà utilisé en Production pour
--     les ajustements de sortie (`cancel_lease_future_dues`). Le dépôt reste
--     ainsi strictement séparé du loyer : un crédit d'ouverture loyer ne peut
--     jamais couvrir le dépôt, et réciproquement (l'ordre de couverture de
--     `dues_with_status` traite les échéances périodiques avant le dépôt, et
--     l'ajustement de dépôt cible explicitement et uniquement la Due dépôt).
-- Aucune fonction, trigger ou vue du moteur financier existant n'est modifiée.
-- Aucune ligne n'est jamais insérée dans `public.payments`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Capability — action sensible, Owner uniquement (default deny)
-- ---------------------------------------------------------------------------

alter table public.role_capabilities
  drop constraint if exists role_capabilities_capability_check;

alter table public.role_capabilities
  add constraint role_capabilities_capability_check check (capability = any (array[
    'organization.view','organization.profile.manage',
    'member.view','member.manage',
    'property.view','property.manage',
    'unit.view','unit.manage',
    'tenant.view','tenant.manage',
    'lease.view','lease.manage',
    'due.view',
    'payment.view','payment.record','payment.correct','payment.correction.request',
    'receipt.view','receipt.share',
    'activity.view','audit.view',
    'tenant_portal.manage','contract.manage',
    'billing.view','billing.manage',
    -- IMPORT-01
    'data_import.manage'
  ]));

insert into public.role_capabilities (role, capability) values
  ('organization_owner', 'data_import.manage')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables — batch d'import, audit par ligne (sans PII), empreintes dédoublon
-- ---------------------------------------------------------------------------

create table public.data_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  created_by uuid not null references auth.users (id),
  source text not null check (source in ('csv', 'xlsx')),
  file_name text not null check (char_length(file_name) between 1 and 260),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  migration_as_of_date date not null,
  total_rows integer not null check (total_rows >= 0),
  created_properties integer not null default 0 check (created_properties >= 0),
  matched_properties integer not null default 0 check (matched_properties >= 0),
  created_units integer not null default 0 check (created_units >= 0),
  matched_units integer not null default 0 check (matched_units >= 0),
  created_tenants integer not null default 0 check (created_tenants >= 0),
  matched_tenants integer not null default 0 check (matched_tenants >= 0),
  created_leases integer not null default 0 check (created_leases >= 0),
  skipped_rows integer not null default 0 check (skipped_rows >= 0),
  status text not null default 'committed' check (status in ('committed')),
  created_at timestamptz not null default now(),
  constraint data_imports_organization_file_key unique (organization_id, file_sha256)
);

-- Audit par ligne : uniquement des codes techniques et des identifiants, JAMAIS
-- de nom, téléphone ou email — conformément à la confidentialité (règle 21).
create table public.data_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.data_imports (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  row_number integer not null check (row_number >= 1),
  result text not null check (result in ('created', 'skipped')),
  property_action text check (property_action in ('created', 'associated')),
  unit_action text check (unit_action in ('created', 'associated')),
  tenant_action text check (tenant_action in ('created', 'associated')),
  lease_id uuid,
  property_id uuid,
  unit_id uuid,
  tenant_id uuid,
  created_at timestamptz not null default now(),
  constraint data_import_rows_import_row_key unique (import_id, row_number)
);

-- Empreintes de dédoublonnage / idempotence. Une empreinte est une valeur déjà
-- normalisée côté serveur (TS), jamais le nom brut réaffiché : elle sert de
-- clé technique, pas d'export.
create table public.data_import_fingerprints (
  organization_id uuid not null references public.organizations (id) on delete restrict,
  entity_type text not null check (entity_type in ('property', 'unit', 'tenant')),
  fingerprint text not null check (char_length(fingerprint) between 3 and 300),
  entity_id uuid not null,
  import_id uuid not null references public.data_imports (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (organization_id, entity_type, fingerprint)
);

create index data_imports_organization_created_idx
  on public.data_imports (organization_id, created_at desc);
create index data_import_rows_import_idx
  on public.data_import_rows (import_id, row_number);
create index data_import_fingerprints_entity_idx
  on public.data_import_fingerprints (organization_id, entity_type, entity_id);

alter table public.data_imports enable row level security;
alter table public.data_import_rows enable row level security;
alter table public.data_import_fingerprints enable row level security;

create policy "authorized owners read data imports"
on public.data_imports for select to authenticated
using ((select private.has_capability(organization_id, 'data_import.manage')));

create policy "authorized owners read data import rows"
on public.data_import_rows for select to authenticated
using ((select private.has_capability(organization_id, 'data_import.manage')));

create policy "authorized owners read data import fingerprints"
on public.data_import_fingerprints for select to authenticated
using ((select private.has_capability(organization_id, 'data_import.manage')));

-- Aucun accès direct en écriture : uniquement via commit_data_import (security
-- definer) ci-dessous, après vérification RBAC + quotas + validations.
revoke all on public.data_imports, public.data_import_rows, public.data_import_fingerprints
  from public, anon, authenticated;
grant select on public.data_imports, public.data_import_rows, public.data_import_fingerprints to authenticated;

comment on table public.data_imports is
  'IMPORT-01 : en-tête de lot de migration de données (Rentila/CSV/Excel). Aucun fichier brut conservé.';
comment on table public.data_import_rows is
  'IMPORT-01 : audit par ligne, sans donnée personnelle — codes et identifiants uniquement.';
comment on table public.data_import_fingerprints is
  'IMPORT-01 : empreintes de dédoublonnage/idempotence. Une même empreinte ne crée jamais deux entités.';

-- ---------------------------------------------------------------------------
-- 3. Helpers de résolution dédoublon (lecture / écriture d'empreinte)
-- ---------------------------------------------------------------------------

create or replace function private.lookup_import_fingerprint(
  target_organization_id uuid,
  p_entity_type text,
  p_fingerprint text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select entity_id from public.data_import_fingerprints
  where organization_id = target_organization_id
    and entity_type = p_entity_type
    and fingerprint = p_fingerprint
  limit 1;
$$;

create or replace function private.record_import_fingerprint(
  target_organization_id uuid,
  p_entity_type text,
  p_fingerprint text,
  p_entity_id uuid,
  p_import_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.data_import_fingerprints (organization_id, entity_type, fingerprint, entity_id, import_id)
  values (target_organization_id, p_entity_type, p_fingerprint, p_entity_id, p_import_id)
  on conflict (organization_id, entity_type, fingerprint) do nothing;
$$;

revoke all on function private.lookup_import_fingerprint(uuid, text, text) from public, anon, authenticated;
revoke all on function private.record_import_fingerprint(uuid, text, text, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. commit_data_import — écriture transactionnelle unique
-- ---------------------------------------------------------------------------
-- Toute erreur (ligne invalide, quota atteint, conflit de location) fait
-- échouer l'appel entier : PostgreSQL annule alors tout ce que la fonction a
-- déjà écrit dans cette transaction (aucune Organization à moitié importée).
-- Les quotas (biens/logements) sont appliqués par les triggers déjà en
-- Production (`enforce_property_quota`, `enforce_active_unit_quota`) : ils
-- s'exécutent pour tout INSERT quel que soit l'appelant, y compris cette
-- fonction security definer — aucun contournement possible.

create or replace function public.commit_data_import(
  target_organization_id uuid,
  migration_as_of_date date,
  import_source text,
  import_file_name text,
  import_file_sha256 text,
  import_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  existing_import_id uuid;
  new_import_id uuid;
  row_count integer;
  row_index integer := 0;
  row_data jsonb;

  prop jsonb; unit jsonb; tenant_data jsonb; lease_data jsonb;
  opening jsonb; deposit jsonb;

  resolved_property_id uuid;
  resolved_unit_id uuid;
  resolved_tenant_id uuid;
  new_lease_id uuid;
  deposit_due_id uuid;

  property_action text;
  unit_action text;
  tenant_action text;

  property_type text;
  is_new_property boolean;

  frequency_months integer;
  elapsed_periods integer;
  count_period_index integer;
  count_scheduled_start date;
  count_due_date date;
  count_notice_date date;
  periodic_total_xaf bigint;
  total_elapsed_expected_xaf bigint;
  opening_kind text;
  opening_amount_xaf bigint;
  initial_prepayment_xaf bigint;

  deposit_status text;
  deposit_required_xaf bigint;
  deposit_paid_xaf bigint;

  start_date date;
  billing_frequency text;
  base_rent_xaf bigint;
  recurring_charges_xaf bigint;
  due_day smallint;

  created_properties_count integer := 0;
  matched_properties_count integer := 0;
  created_units_count integer := 0;
  matched_units_count integer := 0;
  created_tenants_count integer := 0;
  matched_tenants_count integer := 0;
  created_leases_count integer := 0;
  skipped_rows_count integer := 0;

  max_rows constant integer := 500;
begin
  if not (select private.has_capability(target_organization_id, 'data_import.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if import_source not in ('csv', 'xlsx') then
    raise exception 'IMPORT_INVALID_SOURCE' using errcode = '22023';
  end if;
  if import_file_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'IMPORT_INVALID_FINGERPRINT' using errcode = '22023';
  end if;

  -- Idempotence de fichier : le même fichier réimporté ne rejoue rien.
  select id into existing_import_id
  from public.data_imports
  where organization_id = target_organization_id and file_sha256 = import_file_sha256;

  if existing_import_id is not null then
    return jsonb_build_object('already_imported', true, 'import_id', existing_import_id);
  end if;

  if jsonb_typeof(import_rows) <> 'array' then
    raise exception 'IMPORT_ROWS_MUST_BE_ARRAY' using errcode = '22023';
  end if;
  row_count := jsonb_array_length(import_rows);
  if row_count < 1 then
    raise exception 'IMPORT_EMPTY' using errcode = '22023';
  end if;
  if row_count > max_rows then
    raise exception 'IMPORT_TOO_MANY_ROWS'
      using errcode = '22023', detail = jsonb_build_object('max_rows', max_rows, 'received', row_count)::text;
  end if;

  perform 1 from public.organizations where id = target_organization_id for update;

  new_import_id := gen_random_uuid();

  -- L'en-tête est inséré AVANT la boucle (compteurs à zéro, mis à jour à la
  -- fin) car les empreintes de dédoublonnage créées pendant la boucle
  -- référencent cet import_id par clé étrangère.
  insert into public.data_imports (
    id, organization_id, created_by, source, file_name, file_sha256, migration_as_of_date, total_rows
  ) values (
    new_import_id, target_organization_id, actor_user_id, import_source, import_file_name, import_file_sha256, migration_as_of_date, row_count
  );

  for row_data in select value from jsonb_array_elements(import_rows)
  loop
    row_index := row_index + 1;

    if coalesce((row_data->>'skip')::boolean, false) then
      skipped_rows_count := skipped_rows_count + 1;
      insert into public.data_import_rows (import_id, organization_id, row_number, result)
      values (new_import_id, target_organization_id, row_index, 'skipped');
      continue;
    end if;

    prop := row_data->'property';
    unit := row_data->'unit';
    tenant_data := row_data->'tenant';
    lease_data := row_data->'lease';

    if prop is null or jsonb_typeof(prop) <> 'object'
      or unit is null or jsonb_typeof(unit) <> 'object'
      or tenant_data is null or jsonb_typeof(tenant_data) <> 'object'
      or lease_data is null or jsonb_typeof(lease_data) <> 'object' then
      raise exception 'IMPORT_ROW_INCOMPLETE'
        using errcode = '22023', detail = jsonb_build_object('row', row_index)::text;
    end if;

    -- ------------------------------------------------------------------
    -- Bien
    -- ------------------------------------------------------------------
    property_type := prop->>'type';
    if property_type not in ('house', 'building') then
      raise exception 'IMPORT_PROPERTY_TYPE_INVALID'
        using errcode = '22023', detail = jsonb_build_object('row', row_index)::text;
    end if;

    resolved_property_id := null;
    is_new_property := false;
    if prop->>'fingerprint' is not null then
      resolved_property_id := private.lookup_import_fingerprint(target_organization_id, 'property', prop->>'fingerprint');
    end if;
    if resolved_property_id is null and prop->>'existing_id' is not null then
      select id into resolved_property_id from public.properties
        where id = (prop->>'existing_id')::uuid and organization_id = target_organization_id and status = 'active';
      if resolved_property_id is null then
        raise exception 'IMPORT_PROPERTY_NOT_FOUND'
          using errcode = '23503', detail = jsonb_build_object('row', row_index)::text;
      end if;
    end if;
    if resolved_property_id is null then
      if coalesce(char_length(trim(prop->>'name')), 0) < 2 or coalesce(char_length(trim(prop->>'locality')), 0) < 2 then
        raise exception 'IMPORT_PROPERTY_FIELDS_INVALID'
          using errcode = '22023', detail = jsonb_build_object('row', row_index)::text;
      end if;
      insert into public.properties (organization_id, name, locality, type, created_by)
      values (target_organization_id, trim(prop->>'name'), trim(prop->>'locality'), property_type, actor_user_id)
      returning id into resolved_property_id;
      is_new_property := true;
      created_properties_count := created_properties_count + 1;
      if prop->>'fingerprint' is not null then
        perform private.record_import_fingerprint(target_organization_id, 'property', prop->>'fingerprint', resolved_property_id, new_import_id);
      end if;
      property_action := 'created';
    else
      matched_properties_count := matched_properties_count + 1;
      property_action := 'associated';
      select type into property_type from public.properties where id = resolved_property_id;
    end if;

    -- ------------------------------------------------------------------
    -- Logement — un bien "house" a déjà son unique logement "Maison entière"
    -- (créé automatiquement par le trigger properties_initialize) : on le
    -- réutilise toujours, on n'en crée jamais un second.
    -- ------------------------------------------------------------------
    if property_type = 'house' then
      select id into resolved_unit_id from public.units
        where organization_id = target_organization_id and property_id = resolved_property_id
          and type = 'whole_house' and status = 'active'
        limit 1;
      if resolved_unit_id is null then
        raise exception 'IMPORT_HOUSE_UNIT_MISSING'
          using errcode = '23503', detail = jsonb_build_object('row', row_index)::text;
      end if;
      unit_action := 'associated';
      matched_units_count := matched_units_count + 1;
    else
      resolved_unit_id := null;
      if unit->>'fingerprint' is not null then
        resolved_unit_id := private.lookup_import_fingerprint(target_organization_id, 'unit', unit->>'fingerprint');
      end if;
      if resolved_unit_id is null and unit->>'existing_id' is not null then
        select id into resolved_unit_id from public.units
          where id = (unit->>'existing_id')::uuid and organization_id = target_organization_id
            and property_id = resolved_property_id and status = 'active';
        if resolved_unit_id is null then
          raise exception 'IMPORT_UNIT_NOT_FOUND'
            using errcode = '23503', detail = jsonb_build_object('row', row_index)::text;
        end if;
      end if;
      if resolved_unit_id is null then
        if coalesce(char_length(trim(unit->>'label')), 0) < 1
          or (unit->>'type') not in ('apartment', 'studio', 'room', 'shop', 'office') then
          raise exception 'IMPORT_UNIT_FIELDS_INVALID'
            using errcode = '22023', detail = jsonb_build_object('row', row_index)::text;
        end if;
        insert into public.units (organization_id, property_id, label, type, area_sqm, created_by)
        values (
          target_organization_id, resolved_property_id, trim(unit->>'label'), unit->>'type',
          nullif(unit->>'area_sqm', '')::numeric, actor_user_id
        )
        returning id into resolved_unit_id;
        created_units_count := created_units_count + 1;
        if unit->>'fingerprint' is not null then
          perform private.record_import_fingerprint(target_organization_id, 'unit', unit->>'fingerprint', resolved_unit_id, new_import_id);
        end if;
        unit_action := 'created';
      else
        matched_units_count := matched_units_count + 1;
        unit_action := 'associated';
      end if;
    end if;

    -- ------------------------------------------------------------------
    -- Locataire
    -- ------------------------------------------------------------------
    resolved_tenant_id := null;
    if tenant_data->>'fingerprint' is not null then
      resolved_tenant_id := private.lookup_import_fingerprint(target_organization_id, 'tenant', tenant_data->>'fingerprint');
    end if;
    if resolved_tenant_id is null and tenant_data->>'existing_id' is not null then
      select id into resolved_tenant_id from public.tenants
        where id = (tenant_data->>'existing_id')::uuid and organization_id = target_organization_id;
      if resolved_tenant_id is null then
        raise exception 'IMPORT_TENANT_NOT_FOUND'
          using errcode = '23503', detail = jsonb_build_object('row', row_index)::text;
      end if;
    end if;
    if resolved_tenant_id is null then
      if coalesce(char_length(trim(tenant_data->>'full_name')), 0) < 2
        or (nullif(trim(coalesce(tenant_data->>'phone', '')), '') is null
            and nullif(trim(coalesce(tenant_data->>'email', '')), '') is null) then
        raise exception 'IMPORT_TENANT_FIELDS_INVALID'
          using errcode = '22023', detail = jsonb_build_object('row', row_index)::text;
      end if;
      insert into public.tenants (organization_id, full_name, phone, email, created_by)
      values (
        target_organization_id, trim(tenant_data->>'full_name'),
        nullif(trim(coalesce(tenant_data->>'phone', '')), ''),
        nullif(trim(coalesce(tenant_data->>'email', '')), ''),
        actor_user_id
      )
      returning id into resolved_tenant_id;
      created_tenants_count := created_tenants_count + 1;
      if tenant_data->>'fingerprint' is not null then
        perform private.record_import_fingerprint(target_organization_id, 'tenant', tenant_data->>'fingerprint', resolved_tenant_id, new_import_id);
      end if;
      tenant_action := 'created';
    else
      matched_tenants_count := matched_tenants_count + 1;
      tenant_action := 'associated';
    end if;

    -- ------------------------------------------------------------------
    -- Location — toujours une nouvelle Location active (IMPORT-01 ne
    -- modifie jamais une Location existante).
    -- ------------------------------------------------------------------
    start_date := (lease_data->>'start_date')::date;
    billing_frequency := lease_data->>'billing_frequency';
    base_rent_xaf := (lease_data->>'base_rent_xaf')::bigint;
    recurring_charges_xaf := coalesce((lease_data->>'recurring_charges_xaf')::bigint, 0);
    due_day := coalesce((lease_data->>'due_day')::smallint, extract(day from start_date)::smallint);
    if due_day > 28 then due_day := 28; end if;

    if start_date is null or start_date > migration_as_of_date then
      raise exception 'IMPORT_LEASE_START_DATE_INVALID'
        using errcode = '22023', detail = jsonb_build_object('row', row_index)::text;
    end if;
    if billing_frequency not in ('monthly', 'quarterly', 'semiannual', 'annual') then
      raise exception 'IMPORT_LEASE_FREQUENCY_INVALID'
        using errcode = '22023', detail = jsonb_build_object('row', row_index)::text;
    end if;
    if base_rent_xaf is null or base_rent_xaf <= 0 then
      raise exception 'IMPORT_LEASE_RENT_INVALID'
        using errcode = '22023', detail = jsonb_build_object('row', row_index)::text;
    end if;

    opening := lease_data->'opening_situation';
    opening_kind := coalesce(opening->>'kind', 'even');
    opening_amount_xaf := coalesce((opening->>'amount_xaf')::bigint, 0);
    if opening_kind not in ('even', 'debt', 'credit') or opening_amount_xaf < 0 then
      raise exception 'IMPORT_OPENING_SITUATION_INVALID'
        using errcode = '22023', detail = jsonb_build_object('row', row_index)::text;
    end if;

    -- Le nombre d'échéances déjà générées par `generate_lease_dues` avant la
    -- migration ne suit pas un simple compte de mois calendaires : il dépend
    -- de la même condition de sortie que le générateur réel (notice_date <=
    -- aujourd'hui, avec generate_due_days_before par défaut = 5 puisque cette
    -- colonne n'est pas surchargée pour un bail importé). On reproduit donc
    -- EXACTEMENT cette même boucle (sans écriture) pour compter le nombre
    -- d'échéances qui seront réellement créées, afin que le crédit d'ouverture
    -- calculé corresponde exactement à ce que `dues_with_status` verra.
    frequency_months := case billing_frequency
      when 'monthly' then 1 when 'quarterly' then 3 when 'semiannual' then 6 else 12 end;
    elapsed_periods := 0;
    count_period_index := 0;
    loop
      exit when count_period_index >= 240;
      count_scheduled_start := (date_trunc('month', start_date)::date
        + make_interval(months => count_period_index * frequency_months))::date;
      count_due_date := make_date(
        extract(year from count_scheduled_start)::integer,
        extract(month from count_scheduled_start)::integer,
        least(due_day, extract(day from (date_trunc('month', count_scheduled_start) + interval '1 month - 1 day'))::integer)
      );
      count_due_date := greatest(count_due_date, start_date);
      count_notice_date := count_due_date - 5;
      exit when count_notice_date > current_date;
      elapsed_periods := elapsed_periods + 1;
      count_period_index := count_period_index + 1;
    end loop;
    periodic_total_xaf := base_rent_xaf + recurring_charges_xaf;
    total_elapsed_expected_xaf := elapsed_periods * periodic_total_xaf;

    if opening_kind = 'debt' then
      if opening_amount_xaf > total_elapsed_expected_xaf then
        raise exception 'IMPORT_OPENING_BALANCE_INCONSISTENT'
          using errcode = '22023',
                detail = jsonb_build_object(
                  'row', row_index, 'reason', 'debt_exceeds_elapsed_periods',
                  'declared_debt_xaf', opening_amount_xaf, 'elapsed_expected_xaf', total_elapsed_expected_xaf
                )::text;
      end if;
      initial_prepayment_xaf := total_elapsed_expected_xaf - opening_amount_xaf;
    elsif opening_kind = 'credit' then
      initial_prepayment_xaf := total_elapsed_expected_xaf + opening_amount_xaf;
    else
      initial_prepayment_xaf := total_elapsed_expected_xaf;
    end if;

    deposit := lease_data->'deposit_situation';
    deposit_status := coalesce(deposit->>'status', 'not_required');
    deposit_paid_xaf := coalesce((deposit->>'paid_amount_xaf')::bigint, 0);
    if deposit_status not in ('not_required', 'due', 'partial', 'paid') then
      raise exception 'IMPORT_DEPOSIT_STATUS_INVALID'
        using errcode = '22023', detail = jsonb_build_object('row', row_index)::text;
    end if;
    if deposit_status = 'not_required' then
      deposit_required_xaf := 0;
      deposit_paid_xaf := 0;
    else
      deposit_required_xaf := coalesce((lease_data->>'security_deposit_xaf')::bigint, 0);
      if deposit_required_xaf <= 0 then
        raise exception 'IMPORT_DEPOSIT_REQUIRED_AMOUNT_INVALID'
          using errcode = '22023', detail = jsonb_build_object('row', row_index)::text;
      end if;
      if deposit_status = 'due' then deposit_paid_xaf := 0; end if;
      if deposit_status = 'paid' then deposit_paid_xaf := deposit_required_xaf; end if;
      if deposit_paid_xaf > deposit_required_xaf then
        raise exception 'IMPORT_DEPOSIT_PAID_EXCEEDS_REQUIRED'
          using errcode = '22023', detail = jsonb_build_object('row', row_index)::text;
      end if;
      if deposit_status = 'partial' and (deposit_paid_xaf <= 0 or deposit_paid_xaf >= deposit_required_xaf) then
        raise exception 'IMPORT_DEPOSIT_PARTIAL_AMOUNT_INVALID'
          using errcode = '22023', detail = jsonb_build_object('row', row_index)::text;
      end if;
    end if;

    insert into public.leases (
      organization_id, property_id, unit_id, tenant_id, status, start_date,
      base_rent_xaf, recurring_charges_xaf, security_deposit_xaf,
      initial_prepayment_periods, initial_prepayment_amount_xaf,
      billing_frequency, due_day, created_by
    ) values (
      target_organization_id, resolved_property_id, resolved_unit_id, resolved_tenant_id, 'active', start_date,
      base_rent_xaf, recurring_charges_xaf, deposit_required_xaf,
      case when periodic_total_xaf > 0 then round(initial_prepayment_xaf::numeric / periodic_total_xaf, 2) else 0 end,
      initial_prepayment_xaf,
      billing_frequency, due_day, actor_user_id
    ) returning id into new_lease_id;
    created_leases_count := created_leases_count + 1;

    if deposit_required_xaf > 0 and deposit_paid_xaf > 0 then
      select id into deposit_due_id from public.dues
        where organization_id = target_organization_id and lease_id = new_lease_id and kind = 'deposit'
        limit 1;
      if deposit_due_id is null then
        raise exception 'IMPORT_DEPOSIT_DUE_MISSING'
          using errcode = '23503', detail = jsonb_build_object('row', row_index)::text;
      end if;
      insert into public.dues (
        organization_id, lease_id, tenant_id, kind, generation_key, reference,
        period_start, period_end, due_date, notice_date,
        adjustment_amount_xaf, adjustment_direction, adjusted_due_id, calculation, created_by
      ) values (
        target_organization_id, new_lease_id, resolved_tenant_id, 'adjustment',
        'import:deposit-opening-credit', 'IMP-DEP-' || to_char(start_date, 'YYYYMMDD'),
        start_date, start_date, start_date, start_date,
        deposit_paid_xaf, 'credit', deposit_due_id,
        jsonb_build_object(
          'reason', 'import_opening_deposit_credit',
          'is_payment', false,
          'import_id', new_import_id
        ),
        actor_user_id
      );
    end if;

    insert into public.data_import_rows (
      import_id, organization_id, row_number, result,
      property_action, unit_action, tenant_action,
      lease_id, property_id, unit_id, tenant_id
    ) values (
      new_import_id, target_organization_id, row_index, 'created',
      property_action, unit_action, tenant_action,
      new_lease_id, resolved_property_id, resolved_unit_id, resolved_tenant_id
    );
  end loop;

  update public.data_imports set
    created_properties = created_properties_count,
    matched_properties = matched_properties_count,
    created_units = created_units_count,
    matched_units = matched_units_count,
    created_tenants = created_tenants_count,
    matched_tenants = matched_tenants_count,
    created_leases = created_leases_count,
    skipped_rows = skipped_rows_count
  where id = new_import_id;

  return jsonb_build_object(
    'already_imported', false,
    'import_id', new_import_id,
    'total_rows', row_count,
    'created_properties', created_properties_count,
    'matched_properties', matched_properties_count,
    'created_units', created_units_count,
    'matched_units', matched_units_count,
    'created_tenants', created_tenants_count,
    'matched_tenants', matched_tenants_count,
    'created_leases', created_leases_count,
    'skipped_rows', skipped_rows_count
  );
end;
$$;

revoke all on function public.commit_data_import(uuid, date, text, text, text, jsonb) from public, anon;
grant execute on function public.commit_data_import(uuid, date, text, text, text, jsonb) to authenticated;

comment on function public.commit_data_import(uuid, date, text, text, text, jsonb) is
  'IMPORT-01 : écriture transactionnelle unique du lot d''import. Réutilise initial_prepayment_amount_xaf (opening_credit loyer) et une Due d''ajustement dédiée (crédit dépôt) — jamais un Payment. Idempotent par file_sha256 et par empreinte par entité.';

create or replace function public.list_data_imports(target_organization_id uuid)
returns table (
  id uuid,
  created_by_email text,
  source text,
  file_name text,
  migration_as_of_date date,
  total_rows integer,
  created_properties integer,
  matched_properties integer,
  created_units integer,
  matched_units integer,
  created_tenants integer,
  matched_tenants integer,
  created_leases integer,
  skipped_rows integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.has_capability(target_organization_id, 'data_import.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select di.id, u.email::text, di.source, di.file_name, di.migration_as_of_date,
      di.total_rows, di.created_properties, di.matched_properties, di.created_units, di.matched_units,
      di.created_tenants, di.matched_tenants, di.created_leases, di.skipped_rows, di.created_at
    from public.data_imports di
    left join auth.users u on u.id = di.created_by
    where di.organization_id = target_organization_id
    order by di.created_at desc
    limit 50;
end;
$$;

revoke all on function public.list_data_imports(uuid) from public, anon;
grant execute on function public.list_data_imports(uuid) to authenticated;

comment on function public.list_data_imports(uuid) is
  'IMPORT-01 : historique des lots d''import, capability data_import.manage requise.';

commit;
