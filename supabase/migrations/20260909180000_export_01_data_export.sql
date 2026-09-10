begin;

-- =============================================================================
-- EXPORT-01 — Export des données KJORA (portabilité, lecture seule)
-- =============================================================================
-- Objectif : permettre à un propriétaire/gestionnaire autorisé d'exporter ses
-- propres données KJORA (biens, logements, locataires, locations, échéances,
-- paiements, allocations, crédits, dépôts, situation des comptes, documents
-- financiers, contrats) sans jamais modifier ni supprimer quoi que ce soit.
--
-- Ce lot n'ajoute AUCUNE nouvelle table de données métier : la génération du
-- fichier (CSV/XLSX/ZIP) se fait entièrement côté serveur Next.js par simple
-- lecture des tables existantes, avec le client Supabase de l'utilisateur
-- authentifié — donc sous les RLS déjà en place sur chaque table (isolation
-- Organization déjà garantie par construction, pas de nouvelle policy à
-- écrire sur les données elles-mêmes).
--
-- Seul ajout de schéma : une table d'audit `data_exports` (aucun contenu de
-- fichier, aucune donnée personnelle — uniquement format, périmètre déclaré
-- et compteurs) et deux RPC minces qui la journalisent, avec re-vérification
-- RBAC + entitlement de plan en base (défense en profondeur de la
-- vérification déjà faite côté serveur), à l'image de IMPORT-01.
--
-- Entitlement : réutilise `exports_standard` (Essentiel+, CSV/XLSX) et
-- `exports_advanced` (Avancé+, export global ZIP avec documents PDF) —
-- déjà définis dans `plan_features` depuis ALIGN-01 mais jamais câblés à une
-- fonctionnalité réelle jusqu'ici. Aucun nouvel entitlement n'est créé.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Capability — action sensible, Owner par défaut (deny by default)
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
    'data_import.manage',
    -- EXPORT-01
    'data_export.manage'
  ]));

insert into public.role_capabilities (role, capability) values
  ('organization_owner', 'data_export.manage')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Table d'audit — aucune donnée personnelle, aucun contenu de fichier
-- ---------------------------------------------------------------------------

create table public.data_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  requested_by uuid not null references auth.users (id),
  format text not null check (format in ('csv', 'xlsx', 'zip')),
  scope text[] not null check (array_length(scope, 1) between 1 and 20),
  plan_feature text not null check (plan_feature in ('exports_standard', 'exports_advanced')),
  range_from date,
  range_to date check (range_to is null or range_from is null or range_to >= range_from),
  row_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(row_counts) = 'object'),
  status text not null default 'ready' check (status in ('ready', 'failed')),
  requested_at timestamptz not null default now(),
  downloaded_at timestamptz,
  downloaded_count integer not null default 0 check (downloaded_count >= 0)
);

create index data_exports_organization_requested_idx
  on public.data_exports (organization_id, requested_at desc);

alter table public.data_exports enable row level security;

create policy "authorized owners read data exports"
on public.data_exports for select to authenticated
using ((select private.has_capability(organization_id, 'data_export.manage')));

-- Aucun accès direct en écriture : uniquement via les RPC ci-dessous, après
-- vérification RBAC + entitlement de plan.
revoke all on public.data_exports from public, anon, authenticated;
grant select on public.data_exports to authenticated;

comment on table public.data_exports is
  'EXPORT-01 : audit des exports de données demandés (format, périmètre déclaré, compteurs de lignes). Aucun contenu de fichier, aucune donnée personnelle.';

-- ---------------------------------------------------------------------------
-- 3. RPC — demande d'export (RBAC + entitlement re-vérifiés en base)
-- ---------------------------------------------------------------------------

create or replace function public.request_data_export(
  target_organization_id uuid,
  target_format text,
  target_scope text[],
  target_row_counts jsonb default '{}'::jsonb,
  target_range_from date default null,
  target_range_to date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  required_feature text;
  current_plan text;
  export_id uuid;
begin
  if not (select private.has_capability(target_organization_id, 'data_export.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_format not in ('csv', 'xlsx', 'zip') then
    raise exception 'invalid_export_format' using errcode = '22023';
  end if;
  if target_scope is null or array_length(target_scope, 1) is null or array_length(target_scope, 1) > 20 then
    raise exception 'invalid_export_scope' using errcode = '22023';
  end if;
  if target_range_to is not null and target_range_from is not null and target_range_to < target_range_from then
    raise exception 'invalid_export_range' using errcode = '22023';
  end if;

  -- CSV/XLSX (par table) relèvent de l'entitlement exports_standard (Essentiel+) ;
  -- le ZIP global (documents PDF inclus) relève de exports_advanced (Avancé+).
  required_feature := case when target_format = 'zip' then 'exports_advanced' else 'exports_standard' end;
  select plan into current_plan from private.get_org_plan(target_organization_id);
  if not (select private.check_plan_feature(target_organization_id, required_feature)) then
    raise exception 'PLAN_FEATURE_NOT_AVAILABLE' using errcode = 'P0001',
      detail = json_build_object('plan', coalesce(current_plan, 'decouverte'), 'quota', null, 'current', 0)::text;
  end if;

  insert into public.data_exports (organization_id, requested_by, format, scope, plan_feature, row_counts, range_from, range_to)
  values (target_organization_id, (select auth.uid()), target_format, target_scope, required_feature, coalesce(target_row_counts, '{}'::jsonb), target_range_from, target_range_to)
  returning id into export_id;
  return export_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC — journalisation du téléchargement effectif (§24 audit)
-- ---------------------------------------------------------------------------

create or replace function public.record_data_export_download(target_export_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare selected public.data_exports%rowtype;
begin
  select * into selected from public.data_exports where id = target_export_id;
  if selected.id is null or not (select private.has_capability(selected.organization_id, 'data_export.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.data_exports
    set downloaded_at = now(), downloaded_count = downloaded_count + 1
    where id = target_export_id;
end;
$$;

revoke all on function public.request_data_export(uuid, text, text[], jsonb, date, date) from public, anon;
grant execute on function public.request_data_export(uuid, text, text[], jsonb, date, date) to authenticated;
revoke all on function public.record_data_export_download(uuid) from public, anon;
grant execute on function public.record_data_export_download(uuid) to authenticated;

comment on function public.request_data_export(uuid, text, text[], jsonb, date, date) is
  'EXPORT-01 : journalise une demande d''export (RBAC data_export.manage + entitlement exports_standard/exports_advanced re-vérifiés). Ne lit ni n''écrit aucune donnée métier.';
comment on function public.record_data_export_download(uuid) is
  'EXPORT-01 : journalise un téléchargement effectif d''export déjà demandé par cette Organization.';

commit;
