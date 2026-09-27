begin;

-- =============================================================================
-- KJORA — REVENUE-LAUNCH-01 — Sous-lot 01I — Contacts commerciaux
-- =============================================================================
-- NON APPLIQUÉE à ce stade (ni Dev, ni Production) — même point d'arrêt que
-- tous les lots précédents de REVENUE-LAUNCH-01.
--
-- Audit préalable (voir session, agent d'exploration dédié) : aucune table ni
-- RPC existante ne trace un consentement marketing, un téléphone ou un pays
-- de contact nulle part dans le schéma (grep sur consent/marketing/newsletter/
-- unsubscribe/opt_in : zéro résultat pertinent). `organization_profiles`
-- porte déjà `language` (fr/en) mais son `country_code` est verrouillé à
-- 'CM' par une contrainte check — inutilisable tel quel pour un contact
-- commercial (par exemple un propriétaire de la diaspora, physiquement
-- ailleurs qu'au Cameroun) : ce lot introduit donc son propre champ `country`,
-- libre, sans dupliquer ni desserrer cette contrainte existante. Aucun
-- mécanisme d'envoi de courriel de masse/newsletter n'existe dans le code
-- (Resend n'est utilisé que pour du transactionnel : invitations, reçus,
-- rappels d'échéance) — ce lot ne construit et ne câble AUCUN envoi de
-- campagne, uniquement de la capture/consultation de consentement.
--
-- Champs du mandat et leur source :
--   • courriel propriétaire — JAMAIS stocké ici (déjà en base via
--     memberships + auth.users, peut changer après un transfert de
--     propriété, REVENUE-01H) : toujours dérivé en lecture, jamais une
--     deuxième source de vérité.
--   • téléphone (facultatif), pays, langue — nouvelles colonnes ci-dessous.
--   • consentement marketing AUDITABLE ET VERSIONNÉ (décision v3) : chaque
--     décision (accord ou retrait) est une ligne IMMUABLE de
--     organization_marketing_consent_events — source, version du texte de
--     consentement, preuve (description obligatoire pour un accord), auteur,
--     horodatage. La fiche contact ne porte que l'état courant et pointe vers
--     la décision qui le justifie (consent_event_id) ; aucune décision n'est
--     jamais modifiée ni supprimée (trigger de protection).
--   • éligibilité marketing (calculée, jamais stockée) : Organization active
--     ET consentement positif ET source + version + preuve présentes ET
--     jamais désabonnée.
--   • désabonnement — `unsubscribed_at`, distinct de "consentement jamais
--     demandé" (marketing_consent=false ET marketing_consent_at IS NULL) :
--     un ex-abonné qui s'est désinscrit reste traçable comme tel, même après
--     la contrainte qui empêche `marketing_consent=true` en même temps.
--   • export Admin minimal — réutilise buildCsvDocument/sanitizeForDisplay
--     (EXPORT-01), mais PAS son couple RPC/table `data_exports` : celui-ci
--     est strictement borné à UNE Organization (audit self-service), quand
--     ce lot a besoin d'un export transversal (toutes les Organizations),
--     réservé à platform_admin — une RPC de lecture dédiée suffit, jamais
--     une deuxième mécanique d'audit d'export.
--   • aucune inscription automatique à une newsletter — aucun trigger sur
--     `organizations`/`memberships` ne crée jamais de ligne dans
--     `organization_commercial_contacts` : seule une action Admin explicite
--     (admin_upsert_organization_contact) en crée une, jamais la création
--     d'une Organization elle-même.
--
-- Réutilisation : administrative_audit_log (historique, extension additive),
-- private.write_administrative_audit, private.touch_updated_at (lot_5b),
-- private.assert_platform_admin, le schéma RLS "aucune policy, tout passe
-- par une RPC security definer" déjà établi par commercial_interventions
-- (ADMIN-BILLING-OPS-01) et admin_organization_notes (REVENUE-01H).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schéma — un contact commercial par Organization
-- -----------------------------------------------------------------------------

create table public.organization_commercial_contacts (
  organization_id uuid primary key references public.organizations (id) on delete cascade,

  phone text check (phone is null or char_length(trim(phone)) between 5 and 30),
  country text not null check (char_length(trim(country)) between 2 and 80),
  -- Même liste fermée que organization_profiles.language (lot_5b).
  language text not null default 'fr' check (language in ('fr', 'en')),

  -- État COURANT uniquement ; l'historique complet vit dans
  -- organization_marketing_consent_events (section 2).
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  -- Liste fermée : aucune inscription publique n'existe encore.
  consent_source text check (consent_source is null or consent_source in ('admin_manual_entry')),
  -- Version du texte de consentement présenté (liste fermée : une nouvelle
  -- formulation exige une nouvelle migration, jamais une chaîne libre).
  consent_version text check (consent_version is null or consent_version in ('kjora-marketing-v1')),
  -- Décision qui justifie l'état courant (preuve).
  consent_event_id uuid,
  unsubscribed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Une décision de consentement a toujours horodatage, source, version et
  -- justification — ou rien de tout cela (fiche sans décision).
  constraint organization_commercial_contacts_consent_pair check (
    (marketing_consent_at is null) = (consent_source is null)
    and (marketing_consent_at is null) = (consent_version is null)
    and (marketing_consent_at is null) = (consent_event_id is null)
  ),
  -- On ne peut pas être simultanément « abonné » et « désabonné ».
  constraint organization_commercial_contacts_consent_unsub_exclusive check (
    not (marketing_consent and unsubscribed_at is not null)
  )
);

alter table public.organization_commercial_contacts enable row level security;
revoke all on public.organization_commercial_contacts from anon, authenticated;

create trigger organization_commercial_contacts_touch_updated_at
before update on public.organization_commercial_contacts
for each row execute function private.touch_updated_at();

comment on table public.organization_commercial_contacts is
  'Contact commercial et état courant du consentement marketing par Organization (REVENUE-01I). Jamais créée automatiquement. Jamais utilisée pour envoyer quoi que ce soit.';

-- -----------------------------------------------------------------------------
-- 2. Journal immuable des décisions de consentement (preuve, versionnée)
-- -----------------------------------------------------------------------------

create table public.organization_marketing_consent_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  consent boolean not null,
  source text not null check (source in ('admin_manual_entry')),
  consent_version text not null check (consent_version in ('kjora-marketing-v1')),
  -- Preuve : comment l'accord a été obtenu (canal, date, référence d'un
  -- formulaire signé...). Obligatoire pour un accord ; facultative pour un
  -- retrait (qui ne doit jamais être entravé).
  evidence text check (evidence is null or char_length(trim(evidence)) between 3 and 500),
  recorded_by uuid not null references auth.users (id),
  recorded_at timestamptz not null default now(),
  constraint organization_marketing_consent_events_grant_has_evidence check (
    not consent or evidence is not null
  )
);

create index organization_marketing_consent_events_org_idx
  on public.organization_marketing_consent_events (organization_id, recorded_at desc);

alter table public.organization_marketing_consent_events enable row level security;
revoke all on public.organization_marketing_consent_events from anon, authenticated;

alter table public.organization_commercial_contacts
  add constraint organization_commercial_contacts_consent_event_fk
  foreign key (consent_event_id) references public.organization_marketing_consent_events (id);

-- Immuabilité : aucune décision n'est jamais réécrite ni effacée, quel que
-- soit le rôle (même le propriétaire des tables).
create or replace function private.forbid_consent_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'marketing consent events are append-only' using errcode = '42501';
end;
$$;

create trigger organization_marketing_consent_events_append_only
before update or delete on public.organization_marketing_consent_events
for each row execute function private.forbid_consent_event_mutation();

comment on table public.organization_marketing_consent_events is
  'REVENUE-01I : journal append-only des décisions de consentement marketing (accord/retrait), avec source, version du texte, preuve, auteur et horodatage. Accès exclusif via RPC Admin.';

-- -----------------------------------------------------------------------------
-- 3. Historique administratif — extension additive
-- -----------------------------------------------------------------------------

alter table public.administrative_audit_log drop constraint administrative_audit_log_action_check;
alter table public.administrative_audit_log add constraint administrative_audit_log_action_check check (action in (
  'member.invited','member.invitation_resent','member.invitation_revoked','member.invitation_accepted',
  'member.role_changed','member.revoked','owner.transferred','payment.reversed','document.invalidated',
  'tenant_portal.invited','tenant_portal.invitation_resent','tenant_portal.invitation_accepted',
  'tenant_portal.revoked','tenant_portal.reactivated','contract.generated','contract.validated',
  'contract.owner_signed','contract.sent','contract.tenant_viewed','contract.tenant_signed',
  'contract.finalized','contract.cancelled',
  'organization.suspended','organization.reactivated','organization.archived','organization.restored',
  'member.disabled_by_admin','member.reactivated_by_admin','owner.transferred_by_admin','admin.note_added',
  -- REVENUE-01I — contacts commerciaux.
  'contact.updated','contact.marketing_consent_changed'
));

-- -----------------------------------------------------------------------------
-- 4. RPC Admin — écriture
-- -----------------------------------------------------------------------------

create or replace function public.admin_upsert_organization_contact(
  target_organization_id uuid,
  p_phone text,
  p_country text,
  p_language text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_phone text;
  safe_country text;
begin
  perform private.assert_platform_admin();

  perform 1 from public.organizations where id = target_organization_id;
  if not found then
    return jsonb_build_object('outcome', 'organization_not_found');
  end if;

  safe_phone := nullif(trim(coalesce(p_phone, '')), '');
  if safe_phone is not null and char_length(safe_phone) not between 5 and 30 then
    return jsonb_build_object('outcome', 'invalid_phone');
  end if;

  safe_country := trim(coalesce(p_country, ''));
  if char_length(safe_country) not between 2 and 80 then
    return jsonb_build_object('outcome', 'country_required');
  end if;

  if p_language is null or p_language not in ('fr', 'en') then
    return jsonb_build_object('outcome', 'invalid_language');
  end if;

  insert into public.organization_commercial_contacts (organization_id, phone, country, language)
  values (target_organization_id, safe_phone, safe_country, p_language)
  on conflict (organization_id) do update
    set phone = excluded.phone, country = excluded.country, language = excluded.language;

  perform private.write_administrative_audit(
    target_organization_id, 'contact.updated', null, null, null,
    jsonb_build_object('country', safe_country, 'language', p_language, 'hasPhone', safe_phone is not null)
  );

  return jsonb_build_object('outcome', 'saved');
end;
$$;

-- Chaque appel écrit UNE décision immuable, puis aligne l'état courant de la
-- fiche sur elle. Un accord exige une version connue et une preuve ; un
-- retrait n'est jamais entravé (version courante par défaut, preuve
-- facultative).
create or replace function public.admin_set_marketing_consent(
  target_organization_id uuid,
  p_consent boolean,
  p_source text,
  p_consent_version text default null,
  p_evidence text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_source text;
  safe_version text;
  safe_evidence text;
  new_event_id uuid;
  decided_at timestamptz := now();
begin
  perform private.assert_platform_admin();

  perform 1 from public.organization_commercial_contacts where organization_id = target_organization_id;
  if not found then
    return jsonb_build_object('outcome', 'contact_not_found');
  end if;

  if p_consent is null then
    return jsonb_build_object('outcome', 'invalid_consent');
  end if;

  safe_source := nullif(trim(coalesce(p_source, '')), '');
  if safe_source is null or safe_source not in ('admin_manual_entry') then
    return jsonb_build_object('outcome', 'invalid_source');
  end if;

  safe_version := nullif(trim(coalesce(p_consent_version, '')), '');
  if p_consent then
    if safe_version is null or safe_version not in ('kjora-marketing-v1') then
      return jsonb_build_object('outcome', 'invalid_consent_version');
    end if;
  else
    safe_version := coalesce(safe_version, 'kjora-marketing-v1');
    if safe_version not in ('kjora-marketing-v1') then
      return jsonb_build_object('outcome', 'invalid_consent_version');
    end if;
  end if;

  safe_evidence := nullif(trim(coalesce(p_evidence, '')), '');
  if p_consent and (safe_evidence is null or char_length(safe_evidence) < 3) then
    return jsonb_build_object('outcome', 'consent_evidence_required');
  end if;
  if safe_evidence is not null and char_length(safe_evidence) > 500 then
    return jsonb_build_object('outcome', 'invalid_consent_evidence');
  end if;

  insert into public.organization_marketing_consent_events (
    organization_id, consent, source, consent_version, evidence, recorded_by, recorded_at
  ) values (
    target_organization_id, p_consent, safe_source, safe_version, safe_evidence, (select auth.uid()), decided_at
  )
  returning id into new_event_id;

  update public.organization_commercial_contacts
     set marketing_consent = p_consent,
         marketing_consent_at = decided_at,
         consent_source = safe_source,
         consent_version = safe_version,
         consent_event_id = new_event_id,
         unsubscribed_at = case when p_consent then null else decided_at end
   where organization_id = target_organization_id;

  -- L'historique administratif ne recopie jamais la preuve (texte libre) :
  -- elle reste dans le journal dédié, lisible par l'Admin seulement.
  perform private.write_administrative_audit(
    target_organization_id, 'contact.marketing_consent_changed', null, null, null,
    jsonb_build_object('consent', p_consent, 'source', safe_source, 'version', safe_version, 'eventId', new_event_id)
  );

  return jsonb_build_object('outcome', 'consent_updated', 'eventId', new_event_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC Admin — lecture (console paginée, export, historique du consentement)
-- -----------------------------------------------------------------------------
-- Éligibilité marketing, formule unique partagée par la console et l'export :
--   organization.status = 'active' ET marketing_consent = true ET
--   consent_source, consent_version, consent_event_id présents ET
--   unsubscribed_at IS NULL.
-- Une Organization archivée ou suspendue n'est JAMAIS éligible, même
-- consentante. Le statut de l'Organization est exposé dans la liste et
-- l'export, jamais omis.

create or replace function private.is_marketing_eligible(
  org_status text,
  consent boolean,
  source text,
  version text,
  event_id uuid,
  unsubscribed timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(org_status = 'active', false)
     and coalesce(consent, false)
     and source is not null
     and version is not null
     and event_id is not null
     and unsubscribed is null;
$$;

create or replace function public.admin_list_commercial_contacts(
  page_limit  integer default 25,
  page_offset integer default 0,
  search_term text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_limit  integer;
  safe_offset integer;
  safe_search text;
  total       bigint;
  page_rows   jsonb;
begin
  perform private.assert_platform_admin();

  safe_limit  := least(greatest(coalesce(page_limit, 25), 1), 100);
  safe_offset := greatest(coalesce(page_offset, 0), 0);
  safe_search := nullif(trim(coalesce(search_term, '')), '');

  select count(*) into total
  from public.organizations o
  left join public.organization_profiles p on p.organization_id = o.id
  left join lateral (
    select u.email::text as owner_email
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = o.id and m.role = 'organization_owner' and m.status = 'active'
    order by m.created_at asc
    limit 1
  ) owner on true
  where (
    safe_search is null
    or p.name ilike '%' || safe_search || '%'
    or owner.owner_email ilike '%' || safe_search || '%'
  );

  select coalesce(jsonb_agg(row_to_json(page)), '[]'::jsonb)
  into page_rows
  from (
    select
      o.id as organization_id,
      coalesce(p.name, '')::text as organization_name,
      o.status::text as organization_status,
      owner.owner_email,
      c.phone,
      c.country,
      c.language,
      coalesce(c.marketing_consent, false) as marketing_consent,
      c.marketing_consent_at,
      c.consent_source,
      c.consent_version,
      c.unsubscribed_at,
      private.is_marketing_eligible(o.status, c.marketing_consent, c.consent_source,
        c.consent_version, c.consent_event_id, c.unsubscribed_at) as marketing_eligible
    from public.organizations o
    left join public.organization_profiles p on p.organization_id = o.id
    left join public.organization_commercial_contacts c on c.organization_id = o.id
    left join lateral (
      select u.email::text as owner_email
      from public.memberships m
      join auth.users u on u.id = m.user_id
      where m.organization_id = o.id and m.role = 'organization_owner' and m.status = 'active'
      order by m.created_at asc
      limit 1
    ) owner on true
    where (
      safe_search is null
      or p.name ilike '%' || safe_search || '%'
      or owner.owner_email ilike '%' || safe_search || '%'
    )
    order by p.name nulls last, o.id
    limit safe_limit offset safe_offset
  ) page;

  return jsonb_build_object(
    'rows', page_rows,
    'total_count', total,
    'limit', safe_limit,
    'offset', safe_offset
  );
end;
$$;

-- Export Admin MINIMAL : mêmes colonnes que la console, jamais une
-- information exclusive à l'export. Non paginé mais borné (5000 lignes).
create or replace function public.admin_list_commercial_contacts_for_export()
returns table (
  organization_name text,
  organization_status text,
  owner_email text,
  phone text,
  country text,
  language text,
  marketing_consent boolean,
  marketing_consent_at timestamptz,
  consent_source text,
  consent_version text,
  unsubscribed_at timestamptz,
  marketing_eligible boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  return query
    select
      coalesce(p.name, '')::text,
      o.status::text,
      owner.owner_email,
      c.phone,
      c.country,
      c.language,
      coalesce(c.marketing_consent, false),
      c.marketing_consent_at,
      c.consent_source,
      c.consent_version,
      c.unsubscribed_at,
      private.is_marketing_eligible(o.status, c.marketing_consent, c.consent_source,
        c.consent_version, c.consent_event_id, c.unsubscribed_at)
    from public.organizations o
    left join public.organization_profiles p on p.organization_id = o.id
    left join public.organization_commercial_contacts c on c.organization_id = o.id
    left join lateral (
      select u.email::text as owner_email
      from public.memberships m
      join auth.users u on u.id = m.user_id
      where m.organization_id = o.id and m.role = 'organization_owner' and m.status = 'active'
      order by m.created_at asc
      limit 1
    ) owner on true
    order by p.name nulls last, o.id
    limit 5000;
end;
$$;

-- Historique complet et immuable des décisions d'une Organization (Admin).
create or replace function public.admin_list_marketing_consent_history(
  target_organization_id uuid
)
returns table (
  event_id uuid,
  consent boolean,
  source text,
  consent_version text,
  evidence text,
  recorded_by_email text,
  recorded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  return query
    select e.id, e.consent, e.source, e.consent_version, e.evidence,
           (select email::text from auth.users where id = e.recorded_by), e.recorded_at
      from public.organization_marketing_consent_events e
     where e.organization_id = target_organization_id
     order by e.recorded_at desc, e.id desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Droits d'exécution
-- -----------------------------------------------------------------------------

revoke all on function public.admin_upsert_organization_contact(uuid, text, text, text) from public, anon;
revoke all on function public.admin_set_marketing_consent(uuid, boolean, text, text, text) from public, anon;
revoke all on function public.admin_list_commercial_contacts(integer, integer, text) from public, anon;
revoke all on function public.admin_list_commercial_contacts_for_export() from public, anon;
revoke all on function public.admin_list_marketing_consent_history(uuid) from public, anon;
revoke all on function private.is_marketing_eligible(text, boolean, text, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.forbid_consent_event_mutation() from public, anon, authenticated;

grant execute on function public.admin_upsert_organization_contact(uuid, text, text, text) to authenticated;
grant execute on function public.admin_set_marketing_consent(uuid, boolean, text, text, text) to authenticated;
grant execute on function public.admin_list_commercial_contacts(integer, integer, text) to authenticated;
grant execute on function public.admin_list_commercial_contacts_for_export() to authenticated;
grant execute on function public.admin_list_marketing_consent_history(uuid) to authenticated;

commit;
