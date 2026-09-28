-- =============================================================================
-- CONTRATS-UX-PILOTE-01
-- =============================================================================
-- Lot unique de correctifs UX « Contrats » avant pilote privé KJORA. Ce
-- fichier ne touche QUE ce qui exige un vrai changement de schéma :
-- « civilité facultative, prénom(s) et nom(s) séparés » pour le locataire
-- (table public.tenants) et pour l'identité individuelle du bailleur portée
-- par le cachet (public.organization_contract_settings). Les autres
-- correctifs du lot (cachet visuel rouge, aperçu réel sur l'écran de
-- génération, bouton « Modalités de paiement » relié à la bonne section,
-- état de chargement/anti double-clic) sont uniquement applicatifs
-- (TypeScript/CSS) et ne nécessitent aucune migration.
--
-- Conception retenue (justifiée en détail dans le rapport du lot) :
--   - `full_name` (tenants) / `stamp_name` (organization_contract_settings)
--     restent les champs AUTHENTIQUES, affichés partout et déjà utilisés par
--     `generate_lease_contract` pour {{tenant.name}} et par le cachet PDF.
--     AUCUNE Location ou Organization existante n'est affectée : ces
--     nouvelles colonnes sont nullables et valent NULL pour tout
--     enregistrement déjà présent, donc l'affichage historique ne change pas
--     d'un seul caractère.
--   - civilité/prénom/nom sont des champs additifs, facultatifs, saisis côté
--     application en complément (pas en remplacement) du nom complet ; le
--     formulaire les propose et pré-remplit le nom complet quand il est
--     vide, mais ne l'écrase jamais silencieusement.
--   - Par prudence, `generate_lease_contract` et le calcul de
--     `lessor.displayName` (clause légale du contrat, couverts par 70+
--     assertions pgTAP dédiées) NE SONT PAS modifiés dans ce lot : le nom
--     complet qui alimente déjà ces clauses reste la seule source, ce qui
--     élimine tout risque de régression sur cette fonction sensible tout en
--     bénéficiant malgré tout d'un nom mieux formaté dès lors qu'il est
--     composé via les nouveaux champs.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Locataire — civilité facultative, prénom(s)/nom(s) séparés.
-- -----------------------------------------------------------------------------

alter table public.tenants
  add column if not exists civility text
    check (civility is null or civility in ('M.', 'Mme')),
  add column if not exists first_name text
    check (first_name is null or char_length(trim(first_name)) between 1 and 80),
  add column if not exists last_name text
    check (last_name is null or char_length(trim(last_name)) between 1 and 80);

comment on column public.tenants.civility is
  'CONTRATS-UX-PILOTE-01 — civilité facultative (M. / Mme). Purement additive : ne remplace jamais full_name, qui reste le champ affiché partout.';
comment on column public.tenants.first_name is
  'CONTRATS-UX-PILOTE-01 — prénom(s) facultatif, saisi séparément du nom complet. NULL pour tout locataire existant avant ce lot (affichage historique inchangé).';
comment on column public.tenants.last_name is
  'CONTRATS-UX-PILOTE-01 — nom(s) facultatif, saisi séparément du nom complet. NULL pour tout locataire existant avant ce lot (affichage historique inchangé).';

-- Même palier de confidentialité que full_name (déjà lisible par tout membre
-- ayant seulement tenant.view, contrairement à téléphone/email/pièce
-- d'identité qui exigent tenant.manage via get_tenant_private_profile).
grant select (civility, first_name, last_name) on public.tenants to authenticated;
grant insert (civility, first_name, last_name) on public.tenants to authenticated;
grant update (civility, first_name, last_name) on public.tenants to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Identité individuelle du bailleur (cachet) — même traitement.
-- -----------------------------------------------------------------------------

alter table public.organization_contract_settings
  add column if not exists stamp_civility text
    check (stamp_civility is null or stamp_civility in ('M.', 'Mme')),
  add column if not exists stamp_first_name text
    check (stamp_first_name is null or char_length(trim(stamp_first_name)) between 1 and 80),
  add column if not exists stamp_last_name text
    check (stamp_last_name is null or char_length(trim(stamp_last_name)) between 1 and 80);

comment on column public.organization_contract_settings.stamp_civility is
  'CONTRATS-UX-PILOTE-01 — civilité facultative de la personne représentée sur le cachet visuel. N''alimente jamais lessor.displayName (clause légale), qui continue de dériver de stamp_company puis du nom de l''Organization.';

-- `get_organization_contract_settings`/`save_organization_contract_settings`
-- changent de forme de retour / de signature : `create or replace` ne suffit
-- pas (Postgres refuse un changement de colonnes de sortie), d'où le drop
-- explicite avant recréation — comportement identique conservé pour tous les
-- champs déjà existants.
drop function if exists public.get_organization_contract_settings(uuid);
drop function if exists public.save_organization_contract_settings(uuid,boolean,text,text,text,text,text);

create function public.get_organization_contract_settings(target_organization_id uuid)
returns table (
  stamp_enabled boolean, stamp_name text, stamp_company text, stamp_phone text, stamp_short_address text, stamp_position text,
  stamp_civility text, stamp_first_name text, stamp_last_name text, updated_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.has_capability(target_organization_id,'contract.manage')) then raise exception 'forbidden' using errcode='42501'; end if;
  return query select coalesce(s.stamp_enabled,true),s.stamp_name,s.stamp_company,s.stamp_phone,s.stamp_short_address,coalesce(s.stamp_position,'signature_block'),
    s.stamp_civility,s.stamp_first_name,s.stamp_last_name,s.updated_at
    from (select 1) seed left join public.organization_contract_settings s on s.organization_id=target_organization_id;
end; $$;

create function public.save_organization_contract_settings(
  target_organization_id uuid, target_enabled boolean, target_name text, target_company text, target_phone text, target_address text, target_position text,
  target_civility text default null, target_first_name text default null, target_last_name text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.has_capability(target_organization_id,'contract.manage')) then raise exception 'forbidden' using errcode='42501'; end if;
  if target_civility is not null and nullif(trim(target_civility),'') is not null and trim(target_civility) not in ('M.','Mme') then
    raise exception 'invalid_stamp_civility' using errcode='22023';
  end if;
  insert into public.organization_contract_settings (
    organization_id,stamp_enabled,stamp_name,stamp_company,stamp_phone,stamp_short_address,stamp_position,
    stamp_civility,stamp_first_name,stamp_last_name,updated_by
  )
    values (
      target_organization_id,target_enabled,nullif(trim(target_name),''),nullif(trim(target_company),''),nullif(trim(target_phone),''),nullif(trim(target_address),''),target_position,
      nullif(trim(target_civility),''),nullif(trim(target_first_name),''),nullif(trim(target_last_name),''),auth.uid()
    )
  on conflict (organization_id) do update set stamp_enabled=excluded.stamp_enabled,stamp_name=excluded.stamp_name,stamp_company=excluded.stamp_company,
    stamp_phone=excluded.stamp_phone,stamp_short_address=excluded.stamp_short_address,stamp_position=excluded.stamp_position,
    stamp_civility=excluded.stamp_civility,stamp_first_name=excluded.stamp_first_name,stamp_last_name=excluded.stamp_last_name,
    updated_by=auth.uid(),updated_at=now();
  return target_organization_id;
end; $$;

revoke all on function public.get_organization_contract_settings(uuid) from public, anon;
grant execute on function public.get_organization_contract_settings(uuid) to authenticated;
revoke all on function public.save_organization_contract_settings(uuid,boolean,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.save_organization_contract_settings(uuid,boolean,text,text,text,text,text,text,text,text) to authenticated;

commit;
