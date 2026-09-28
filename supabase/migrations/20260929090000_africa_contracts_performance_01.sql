begin;

-- =============================================================================
-- KJORA — AFRICA-CONTRACTS-PERFORMANCE-01 — AXE A (fondation multi-devises)
-- =============================================================================
-- NON APPLIQUÉE (ni Dev, ni Production) — même point d'arrêt que les lots
-- précédents : validation locale uniquement, autorisation explicite requise
-- avant toute application distante.
--
-- Portée EXACTE de cette migration (voir rapport AFRICA-CONTRACTS-
-- PERFORMANCE-01 pour la décision complète et ses limites) :
--   1. `organization_profiles.currency_code` accepte désormais 6 devises de
--      location (XAF, XOF, NGN, CDF, KES, ZAR) au lieu de 'XAF' seule.
--   2. `organization_profiles.country_code` accepte un jeu de pays couvrant
--      ces 6 devises, pour proposer un pays/une devise cohérents à la
--      création — SANS coupler pays et devise par une contrainte rigide :
--      le pays ne fait que proposer une devise par défaut côté application
--      (§ décision explicite ci-dessous), la devise reste le seul champ
--      verrouillable après opération financière, conformément au mandat
--      ("la devise peut être changée tant qu'aucune opération financière
--      n'existe ; elle devient alors verrouillée").
--   3. Le verrou de devise est centralisé dans UNE fonction
--      (`private.organization_has_financial_operations`), listant
--      EXPLICITEMENT les relations qui font exister une opération
--      financière : leases, lease_financial_terms, dues, payments,
--      payment_allocations, ledger_entries. `units.reference_rent_xaf` est
--      délibérément EXCLU : un loyer de référence saisi sur un logement est
--      une donnée de catalogue immobilier antérieure à tout bail, pas une
--      opération financière enregistrée.
--   4. `create_organization` et `update_organization_profile_settings` sont
--      recréées pour utiliser ce nouveau catalogue et ce verrou unique — le
--      comportement XAF/CM existant reste identique pour toute Organization
--      qui ne change rien (valeurs par défaut inchangées).
--
-- CE QUE CETTE MIGRATION NE FAIT PAS (limites assumées, détaillées au
-- rapport) :
--   - Elle NE renomme, NE convertit ni NE déplace aucune des 57 colonnes
--     `*_xaf` existantes (7 tables + 3 vues, réaudité et confirmé identique
--     à l'audit antérieur). Elles continuent de stocker un entier en unité
--     MAJEURE (bigint, jamais de centimes) : décision explicite pour ce lot,
--     car les loyers/dépôts de ces marchés sont en pratique toujours des
--     montants entiers, y compris dans les devises à 2 décimales — changer
--     cette sémantique de stockage toucherait les 57 colonnes, leurs
--     contraintes et toutes les fonctions SQL qui les agrègent : un chantier
--     à part, plus risqué, non engagé ici sans plan de compatibilité
--     démontré (ALIGN cette décision avec le mandat : « ne pas détruire de
--     colonnes existantes avant un plan de compatibilité/rétro-remplissage
--     démontré et testé »).
--   - Les décimales par devise (0 pour XAF/XOF, 2 pour NGN/CDF/KES/ZAR/CAD)
--     ne pilotent donc, pour les montants locatifs, que l'AFFICHAGE et
--     l'arrondi (src/core/currency/metadata.ts) — jamais une conversion
--     mineure/majeure de ces colonnes. Seule la facturation SaaS
--     (`billing_invoices.amount_minor`, XAF/CAD) utilise déjà une unité
--     mineure, via `money.ts`, non affectée par ce lot.
--   - Aucune Organization existante n'est modifiée : son country_code et
--     son currency_code restent 'CM'/'XAF' (comportement historique
--     interprété comme XAF, sans conversion implicite, conformément au
--     mandat).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Catalogue pays / devises supportés (contraintes déclaratives, pas de
--    nouvelle table : cohérent avec le style existant du dépôt pour des
--    énumérations fermées — rôles, capacités, statuts).
-- -----------------------------------------------------------------------------

alter table public.organization_profiles
  drop constraint if exists organization_profiles_currency_code_check;
alter table public.organization_profiles
  add constraint organization_profiles_currency_code_check
  check (currency_code in ('XAF', 'XOF', 'NGN', 'CDF', 'KES', 'ZAR'));

-- Cameroun (XAF) ; zone UEMOA/XOF (les 8 pays membres) ; Nigeria (NGN) ;
-- RD Congo (CDF) ; Kenya (KES) ; Afrique du Sud (ZAR). Liste vérifiable,
-- non inventée — aucun pays hors de cette liste n'est présenté comme prêt.
alter table public.organization_profiles
  drop constraint if exists organization_profiles_country_code_check;
alter table public.organization_profiles
  add constraint organization_profiles_country_code_check
  check (country_code in (
    'CM',
    'SN', 'CI', 'BJ', 'BF', 'GW', 'ML', 'NE', 'TG',
    'NG', 'CD', 'KE', 'ZA'
  ));

comment on column public.organization_profiles.currency_code is
  'Devise des opérations locatives de cette Organization. Verrouillée dès '
  'qu''une opération financière existe (private.organization_has_financial_operations). '
  'Distincte de la devise d''abonnement KJORA (organization_subscriptions.currency).';
comment on column public.organization_profiles.country_code is
  'Pays de l''Organization, fixé à la création (AFRICA-CONTRACTS-PERFORMANCE-01). '
  'Propose une devise par défaut côté application ; ne contraint pas rigidement '
  'la devise choisie (une Organization reste libre de toute devise supportée '
  'tant qu''aucune opération financière n''existe).';

-- -----------------------------------------------------------------------------
-- 2. Verrou de devise — UNE seule définition, réutilisée partout.
-- -----------------------------------------------------------------------------

create or replace function private.organization_has_financial_operations(target_organization_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    exists (select 1 from public.leases l where l.organization_id = target_organization_id)
    or exists (select 1 from public.lease_financial_terms t
      join public.leases l on l.id = t.lease_id
      where l.organization_id = target_organization_id)
    or exists (select 1 from public.dues d where d.organization_id = target_organization_id)
    or exists (select 1 from public.payments p where p.organization_id = target_organization_id)
    or exists (select 1 from public.payment_allocations a
      join public.payments p on p.id = a.payment_id
      where p.organization_id = target_organization_id)
    or exists (select 1 from public.ledger_entries e where e.organization_id = target_organization_id)
$$;

comment on function private.organization_has_financial_operations(uuid) is
  'AFRICA-CONTRACTS-PERFORMANCE-01 — Définition UNIQUE et explicite de « une '
  'opération financière existe » pour le verrou de devise : leases, '
  'lease_financial_terms, dues, payments, payment_allocations, ledger_entries. '
  'units.reference_rent_xaf est délibérément exclu (donnée de catalogue '
  'antérieure à tout bail, jamais une opération enregistrée). Utilisée par '
  'create_organization/update_organization_profile_settings et exposée en '
  'lecture par get_organization_currency_lock, pour que TOUT appelant '
  'obtienne exactement la même réponse.';

revoke all on function private.organization_has_financial_operations(uuid) from public, anon, authenticated;

-- Lecture pour l'UI (remplace les 4 comptages séparés effectués auparavant
-- côté page /app/parametres — un seul aller-retour au lieu de quatre, et la
-- liste exhaustive ci-dessus au lieu d'une liste partielle codée dans la page).
create or replace function public.get_organization_currency_lock(target_organization_id uuid)
returns table (is_locked boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not (select private.has_capability(target_organization_id, 'organization.view')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query select private.organization_has_financial_operations(target_organization_id);
end;
$$;

revoke all on function public.get_organization_currency_lock(uuid) from public, anon;
grant execute on function public.get_organization_currency_lock(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. create_organization — pays et devise proposés à la création.
-- -----------------------------------------------------------------------------
-- `create or replace function` avec une liste de paramètres élargie ne
-- remplace PAS l'ancienne fonction à 3 paramètres : Postgres la considère
-- comme un signature distincte et créerait une SURCHARGE, rendant tout appel
-- avec un sous-ensemble d'arguments ambigu ("is not unique"). L'ancienne
-- signature est donc explicitement supprimée avant de recréer la nouvelle.
drop function if exists public.create_organization(text, text, text);

create or replace function public.create_organization(
  organization_name     text,
  organization_language text default 'fr',
  organization_timezone text default 'Africa/Douala',
  organization_country  text default 'CM',
  organization_currency text default 'XAF'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
  current_user_id     uuid := (select auth.uid());
begin
  if current_user_id is null or not exists (
    select 1 from auth.users
    where id = current_user_id
      and email_confirmed_at is not null
  ) then
    raise exception 'verified_identity_required' using errcode = '42501';
  end if;

  if char_length(trim(organization_name)) not between 2 and 120 then
    raise exception 'invalid_organization_name' using errcode = '22023';
  end if;
  if organization_language not in ('fr', 'en') then
    raise exception 'invalid_organization_language' using errcode = '22023';
  end if;
  if char_length(trim(organization_timezone)) not between 3 and 80 then
    raise exception 'invalid_organization_timezone' using errcode = '22023';
  end if;
  -- AFRICA-CONTRACTS-PERFORMANCE-01 : mêmes listes que les contraintes de
  -- organization_profiles — vérifiées ici en amont pour un message d'erreur
  -- explicite plutôt qu'une violation de contrainte générique.
  if organization_country not in (
    'CM', 'SN', 'CI', 'BJ', 'BF', 'GW', 'ML', 'NE', 'TG', 'NG', 'CD', 'KE', 'ZA'
  ) then
    raise exception 'invalid_organization_country' using errcode = '22023';
  end if;
  if organization_currency not in ('XAF', 'XOF', 'NGN', 'CDF', 'KES', 'ZAR') then
    raise exception 'invalid_organization_currency' using errcode = '22023';
  end if;

  perform private.assert_organization_quota(current_user_id);

  insert into public.organizations (created_by)
  values (current_user_id)
  returning id into new_organization_id;

  insert into public.organization_profiles (
    organization_id, name, country_code, currency_code, language, timezone
  ) values (
    new_organization_id,
    trim(organization_name),
    organization_country,
    organization_currency,
    organization_language,
    trim(organization_timezone)
  );

  insert into public.memberships (organization_id, user_id, role)
  values (new_organization_id, current_user_id, 'organization_owner');

  return new_organization_id;
end;
$$;

revoke all on function public.create_organization(text, text, text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text, text, text) to authenticated;

comment on function public.create_organization(text, text, text, text, text) is
  'AFRICA-CONTRACTS-PERFORMANCE-01 : ajoute organization_country/organization_currency '
  '(défauts CM/XAF inchangés) à la création — cf. private.organization_has_financial_operations '
  'pour le verrou appliqué ensuite par update_organization_profile_settings.';

-- -----------------------------------------------------------------------------
-- 4. update_organization_profile_settings — verrou centralisé, 6 devises.
-- -----------------------------------------------------------------------------

create or replace function public.update_organization_profile_settings(
  target_organization_id uuid,
  organization_name text,
  organization_language text,
  organization_timezone text,
  organization_currency text
)
returns table (organization_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_currency text;
begin
  if (select auth.uid()) is null
    or not (select private.has_capability(target_organization_id, 'organization.profile.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(trim(organization_name)) not between 2 and 120
    or organization_language not in ('fr', 'en')
    or not exists (select 1 from pg_catalog.pg_timezone_names where name = organization_timezone) then
    raise exception 'invalid_organization_settings' using errcode = '22023';
  end if;
  if organization_currency not in ('XAF', 'XOF', 'NGN', 'CDF', 'KES', 'ZAR') then
    raise exception 'invalid_organization_currency' using errcode = '22023';
  end if;

  select p.currency_code into current_currency
  from public.organization_profiles p where p.organization_id = target_organization_id for update;
  if current_currency is null then raise exception 'forbidden' using errcode = '42501'; end if;

  -- AFRICA-CONTRACTS-PERFORMANCE-01 : verrou centralisé (liste exhaustive des
  -- 6 relations financières), remplace l'ancienne vérification partielle
  -- (leases/dues/payments/ledger_entries seulement, sans payment_allocations
  -- ni lease_financial_terms) et l'ancien refus systématique hors XAF.
  if current_currency <> organization_currency
    and private.organization_has_financial_operations(target_organization_id) then
    raise exception 'organization_currency_locked' using errcode = '23514';
  end if;

  update public.organization_profiles p set
    name = trim(organization_name), language = organization_language,
    timezone = organization_timezone, currency_code = organization_currency
  where p.organization_id = target_organization_id;
  return query select target_organization_id;
end;
$$;

revoke all on function public.update_organization_profile_settings(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_organization_profile_settings(uuid, text, text, text, text) to authenticated;

comment on function public.update_organization_profile_settings(uuid, text, text, text, text) is
  'AFRICA-CONTRACTS-PERFORMANCE-01 : 6 devises de location supportées, verrou '
  'centralisé via private.organization_has_financial_operations (liste '
  'exhaustive : leases, lease_financial_terms, dues, payments, '
  'payment_allocations, ledger_entries). country_code reste fixé à la '
  'création (non modifiable par cette fonction, comme avant ce lot).';

commit;
