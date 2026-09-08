begin;

-- =============================================================================
-- ALIGN-02 — Onboarding SaaS resumable + enforcement quota Organizations
-- =============================================================================
-- Contenu :
--   1. Colonne rent_collection_method sur organization_profiles (préférence seule)
--   2. Table onboarding_states (reprise + idempotence, 1 ligne par User)
--   3. RLS stricte : chaque User ne voit et n'écrit que sa propre ligne
--   4. RPC get_onboarding_state / upsert_onboarding_state (avance seulement)
--   5. create_organization patché : appel private.assert_organization_quota
--      avant tout INSERT (ENFORCEMENT CREATE ORGANIZATION promis par ALIGN-01)
--
-- Aucun billing, aucun provider, aucun plan payant activé.
-- Découverte reste attribué par le trigger private.auto_assign_decouverte (ALIGN-01).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Préférence d'encaissement des loyers (ALIGN-00 §2.3)
--    Donnée déclarative uniquement : ne branche aucune automatisation.
-- ---------------------------------------------------------------------------

alter table public.organization_profiles
  add column if not exists rent_collection_method text
    check (rent_collection_method is null or rent_collection_method in (
      'mtn_momo', 'orange_money', 'merchant_account', 'bank_transfer', 'cash', 'multiple'
    ));

comment on column public.organization_profiles.rent_collection_method is
  'ALIGN-02 : moyen déclaré de réception des loyers. Préférence de configuration uniquement, '
  'aucune intégration ni automatisation de paiement.';

-- Les grants colonne par colonne du Lot 5B doivent être étendus explicitement.
grant select (rent_collection_method) on public.organization_profiles to authenticated;
grant update (rent_collection_method) on public.organization_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. État d'onboarding — une seule ligne par User, reprise et idempotence
-- ---------------------------------------------------------------------------

create table if not exists public.onboarding_states (
  user_id uuid primary key references auth.users (id) on delete cascade,

  -- Intention de plan issue du site. NON FIABLE en entrée : validée par le RPC.
  -- N'accorde JAMAIS d'entitlement. Conservée pour le futur parcours upgrade.
  plan_intent text
    check (plan_intent is null or plan_intent in (
      'decouverte', 'essentiel', 'avance', 'patrimoine', 'sur_mesure'
    )),

  rent_collection_method text
    check (rent_collection_method is null or rent_collection_method in (
      'mtn_momo', 'orange_money', 'merchant_account', 'bank_transfer', 'cash', 'multiple'
    )),

  -- Ressources déjà créées : garantissent l'idempotence (pas de double création)
  organization_id   uuid references public.organizations (id) on delete set null,
  first_property_id uuid references public.properties (id)    on delete set null,
  first_unit_id     uuid references public.units (id)         on delete set null,

  -- Étape atteinte. N'avance jamais à reculons (garanti par le RPC).
  step text not null default 'plan_intent'
    check (step in ('plan_intent', 'organization', 'rent_method', 'property', 'unit', 'completed')),

  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint onboarding_completed_consistency check (
    (step = 'completed' and completed_at is not null)
    or (step <> 'completed' and completed_at is null)
  )
);

comment on table public.onboarding_states is
  'ALIGN-02 : état d''onboarding par User. Permet la reprise après interruption et '
  'empêche la double création d''Organization/Property/Unit. Ne stocke aucun entitlement.';

create index if not exists onboarding_states_organization_idx
  on public.onboarding_states (organization_id)
  where organization_id is not null;

-- Touch updated_at
create or replace function private.onboarding_states_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists onboarding_states_touch_updated_at on public.onboarding_states;
create trigger onboarding_states_touch_updated_at
before update on public.onboarding_states
for each row execute function private.onboarding_states_touch();

-- ---------------------------------------------------------------------------
-- 3. RLS — isolation stricte par User
-- ---------------------------------------------------------------------------

alter table public.onboarding_states enable row level security;

drop policy if exists onboarding_states_select_own on public.onboarding_states;
create policy onboarding_states_select_own
on public.onboarding_states for select to authenticated
using (user_id = (select auth.uid()));

-- Aucune policy insert/update/delete directe : toute écriture passe par le RPC
-- SECURITY DEFINER ci-dessous. Le client ne peut jamais écrire en direct.
revoke all on public.onboarding_states from anon, authenticated;
grant select (
  user_id, plan_intent, rent_collection_method, organization_id,
  first_property_id, first_unit_id, step, completed_at, created_at, updated_at
) on public.onboarding_states to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC — lecture
-- ---------------------------------------------------------------------------

create or replace function public.get_onboarding_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  st public.onboarding_states;
begin
  if current_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into st from public.onboarding_states where user_id = current_user_id;

  if not found then
    return jsonb_build_object(
      'exists', false,
      'step', 'plan_intent',
      'plan_intent', null,
      'rent_collection_method', null,
      'organization_id', null,
      'first_property_id', null,
      'first_unit_id', null,
      'completed_at', null
    );
  end if;

  return jsonb_build_object(
    'exists', true,
    'step', st.step,
    'plan_intent', st.plan_intent,
    'rent_collection_method', st.rent_collection_method,
    'organization_id', st.organization_id,
    'first_property_id', st.first_property_id,
    'first_unit_id', st.first_unit_id,
    'completed_at', st.completed_at
  );
end;
$$;

revoke all on function public.get_onboarding_state() from public, anon;
grant execute on function public.get_onboarding_state() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC — écriture idempotente, avance seulement
-- ---------------------------------------------------------------------------
-- Règles :
--   • Tous les paramètres sont facultatifs : seul ce qui est fourni est écrit.
--   • Une ressource déjà enregistrée (organization/property/unit) n'est jamais
--     écrasée : la valeur existante gagne. C'est la garantie anti-double-submit.
--   • step n'avance jamais à reculons (ordre canonique ci-dessous).
--   • plan_intent invalide → ignoré silencieusement, aucune erreur technique.
--   • Aucune écriture ne confère d'entitlement.
-- ---------------------------------------------------------------------------

create or replace function private.onboarding_step_rank(p_step text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_step
    when 'plan_intent'  then 0
    when 'organization' then 1
    when 'rent_method'  then 2
    when 'property'     then 3
    when 'unit'         then 4
    when 'completed'    then 5
    else 0
  end;
$$;

create or replace function public.upsert_onboarding_state(
  p_plan_intent            text default null,
  p_rent_collection_method text default null,
  p_organization_id        uuid default null,
  p_first_property_id      uuid default null,
  p_first_unit_id          uuid default null,
  p_step                   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  clean_plan      text;
  clean_method    text;
  clean_step      text;
begin
  if current_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  -- plan_intent NON FIABLE : validé ici, ignoré si invalide (aucune erreur levée)
  clean_plan := case
    when p_plan_intent in ('decouverte', 'essentiel', 'avance', 'patrimoine', 'sur_mesure')
      then p_plan_intent
    else null
  end;

  clean_method := case
    when p_rent_collection_method in (
      'mtn_momo', 'orange_money', 'merchant_account', 'bank_transfer', 'cash', 'multiple'
    ) then p_rent_collection_method
    else null
  end;

  clean_step := case
    when p_step in ('plan_intent', 'organization', 'rent_method', 'property', 'unit', 'completed')
      then p_step
    else null
  end;

  -- L'Organization fournie doit appartenir au User (défense en profondeur)
  if p_organization_id is not null and not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id
      and user_id = current_user_id
      and status = 'active'
  ) then
    raise exception 'organization_not_owned' using errcode = '42501';
  end if;

  insert into public.onboarding_states as os (
    user_id, plan_intent, rent_collection_method,
    organization_id, first_property_id, first_unit_id,
    step, completed_at
  ) values (
    current_user_id, clean_plan, clean_method,
    p_organization_id, p_first_property_id, p_first_unit_id,
    coalesce(clean_step, 'plan_intent'),
    case when clean_step = 'completed' then now() else null end
  )
  on conflict (user_id) do update set
    -- Une valeur déjà posée n'est jamais écrasée par un nouvel appel
    plan_intent            = coalesce(os.plan_intent, excluded.plan_intent),
    rent_collection_method = coalesce(excluded.rent_collection_method, os.rent_collection_method),
    organization_id        = coalesce(os.organization_id, excluded.organization_id),
    first_property_id      = coalesce(os.first_property_id, excluded.first_property_id),
    first_unit_id          = coalesce(os.first_unit_id, excluded.first_unit_id),
    -- step n'avance jamais à reculons
    step = case
      when private.onboarding_step_rank(excluded.step) > private.onboarding_step_rank(os.step)
        then excluded.step
      else os.step
    end,
    completed_at = case
      when os.completed_at is not null then os.completed_at
      when private.onboarding_step_rank(excluded.step) >= 5 then now()
      else null
    end;

  return public.get_onboarding_state();
end;
$$;

revoke all on function public.upsert_onboarding_state(text, text, uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.upsert_onboarding_state(text, text, uuid, uuid, uuid, text)
  to authenticated;

comment on function public.upsert_onboarding_state(text, text, uuid, uuid, uuid, text) is
  'ALIGN-02 : enregistre la progression d''onboarding de façon idempotente. '
  'Les ressources déjà créées ne sont jamais écrasées, step n''avance jamais à reculons, '
  'plan_intent invalide est ignoré silencieusement et n''accorde aucun entitlement.';

-- ---------------------------------------------------------------------------
-- 6. create_organization — enforcement du quota Organizations
-- ---------------------------------------------------------------------------
-- ALIGN-01 a créé private.assert_organization_quota mais ne l'avait pas câblée
-- ("ENFORCEMENT CREATE ORGANIZATION → ALIGN-02"). C'est fait ici.
-- Quotas : Découverte 1 / Essentiel 1 / Avancé 2 / Patrimoine 5 / Sur mesure custom.
-- Dépassement → PLAN_ORGANIZATION_LIMIT_REACHED. Aucune Organization supprimée.
-- ---------------------------------------------------------------------------

create or replace function public.create_organization(
  organization_name     text,
  organization_language text default 'fr',
  organization_timezone text default 'Africa/Douala'
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
  -- Garde d'identité (inchangée — Lot 5B)
  if current_user_id is null or not exists (
    select 1 from auth.users
    where id = current_user_id
      and email_confirmed_at is not null
  ) then
    raise exception 'verified_identity_required' using errcode = '42501';
  end if;

  -- Validation des entrées (inchangée — Lot 5B)
  if char_length(trim(organization_name)) not between 2 and 120 then
    raise exception 'invalid_organization_name' using errcode = '22023';
  end if;
  if organization_language not in ('fr', 'en') then
    raise exception 'invalid_organization_language' using errcode = '22023';
  end if;
  if char_length(trim(organization_timezone)) not between 3 and 80 then
    raise exception 'invalid_organization_timezone' using errcode = '22023';
  end if;

  -- ALIGN-02 : enforcement du quota AVANT tout INSERT
  perform private.assert_organization_quota(current_user_id);

  -- Création atomique (inchangée — Lot 5B)
  insert into public.organizations (created_by)
  values (current_user_id)
  returning id into new_organization_id;

  insert into public.organization_profiles (
    organization_id, name, country_code, currency_code, language, timezone
  ) values (
    new_organization_id,
    trim(organization_name),
    'CM',
    'XAF',
    organization_language,
    trim(organization_timezone)
  );

  insert into public.memberships (organization_id, user_id, role)
  values (new_organization_id, current_user_id, 'organization_owner');

  -- Le plan Découverte est attribué par le trigger private.auto_assign_decouverte (ALIGN-01)

  return new_organization_id;
end;
$$;

revoke all on function public.create_organization(text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text) to authenticated;

comment on function public.create_organization(text, text, text) is
  'ALIGN-02 : enforce PLAN_ORGANIZATION_LIMIT_REACHED via private.assert_organization_quota '
  'avant INSERT. Lot 5B : crée Organization, profil minimal et Membership owner atomiquement. '
  'Découverte est attribué par le trigger AFTER INSERT auto_assign_decouverte (ALIGN-01).';

commit;
