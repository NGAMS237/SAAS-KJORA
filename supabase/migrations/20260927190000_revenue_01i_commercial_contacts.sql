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
--   • consentement marketing horodaté + source du consentement — une seule
--     paire (marketing_consent_at, consent_source), mise à jour à CHAQUE
--     changement d'état (y compris un désabonnement, qui est aussi une
--     décision de consentement horodatée).
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
  -- Même liste fermée que organization_profiles.language (lot_5b) — pas la
  -- même colonne : la préférence de communication commerciale peut différer
  -- de la langue opérationnelle de l'Organization.
  language text not null default 'fr' check (language in ('fr', 'en')),

  marketing_consent boolean not null default false,
  -- Horodatage de la DERNIÈRE décision de consentement (accord ou retrait) —
  -- jamais la date de création de la fiche.
  marketing_consent_at timestamptz,
  -- Liste fermée, volontairement réduite à une seule valeur à ce stade :
  -- aucun formulaire d'inscription public n'existe encore, donc la seule
  -- source réelle est une saisie manuelle par un Admin.
  consent_source text check (consent_source is null or consent_source in ('admin_manual_entry')),
  unsubscribed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Une décision de consentement a toujours à la fois un horodatage et une
  -- source, ou ni l'un ni l'autre (jamais l'un sans l'autre).
  constraint organization_commercial_contacts_consent_pair check (
    (marketing_consent_at is null) = (consent_source is null)
  ),
  -- On ne peut pas être simultanément « abonné » et « désabonné ».
  constraint organization_commercial_contacts_consent_unsub_exclusive check (
    not (marketing_consent and unsubscribed_at is not null)
  )
);

alter table public.organization_commercial_contacts enable row level security;
-- Même schéma que public.commercial_interventions / public.admin_organization_notes :
-- aucune policy, tout accès passe par les RPC `security definer` ci-dessous.
revoke all on public.organization_commercial_contacts from anon, authenticated;

create trigger organization_commercial_contacts_touch_updated_at
before update on public.organization_commercial_contacts
for each row execute function private.touch_updated_at();

comment on table public.organization_commercial_contacts is
  'Contact commercial et consentement marketing par Organization (REVENUE-01I). Jamais créée automatiquement — uniquement via admin_upsert_organization_contact. Jamais utilisée pour envoyer quoi que ce soit : aucun mécanisme de campagne dans ce lot.';

-- -----------------------------------------------------------------------------
-- 2. Historique — extension additive de administrative_audit_log.action
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
-- 3. RPC Admin — écriture
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

  if p_language not in ('fr', 'en') then
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

create or replace function public.admin_set_marketing_consent(
  target_organization_id uuid,
  p_consent boolean,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_source text;
begin
  perform private.assert_platform_admin();

  perform 1 from public.organization_commercial_contacts where organization_id = target_organization_id;
  if not found then
    -- La fiche contact (pays obligatoire) doit exister avant tout
    -- consentement : jamais de ligne créée à moitié renseignée par ce chemin.
    return jsonb_build_object('outcome', 'contact_not_found');
  end if;

  if p_consent is null then
    return jsonb_build_object('outcome', 'invalid_consent');
  end if;

  safe_source := nullif(trim(coalesce(p_source, '')), '');
  if safe_source is null or safe_source not in ('admin_manual_entry') then
    return jsonb_build_object('outcome', 'invalid_source');
  end if;

  update public.organization_commercial_contacts
     set marketing_consent = p_consent,
         marketing_consent_at = now(),
         consent_source = safe_source,
         unsubscribed_at = case when p_consent then null else now() end
   where organization_id = target_organization_id;

  perform private.write_administrative_audit(
    target_organization_id, 'contact.marketing_consent_changed', null, null, null,
    jsonb_build_object('consent', p_consent, 'source', safe_source)
  );

  return jsonb_build_object('outcome', 'consent_updated');
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. RPC Admin — lecture (console paginée + export minimal non paginé)
-- -----------------------------------------------------------------------------

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
      owner.owner_email,
      c.phone,
      c.country,
      c.language,
      coalesce(c.marketing_consent, false) as marketing_consent,
      c.marketing_consent_at,
      c.consent_source,
      c.unsubscribed_at
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

-- Export Admin MINIMAL : mêmes colonnes que la console, jamais de champ
-- absent du reste de la console (aucune information exclusive à l'export).
-- Non paginé mais borné (5000 lignes) — un export Admin transversal, jamais
-- un flux illimité.
create or replace function public.admin_list_commercial_contacts_for_export()
returns table (
  organization_name text,
  owner_email text,
  phone text,
  country text,
  language text,
  marketing_consent boolean,
  marketing_consent_at timestamptz,
  consent_source text,
  unsubscribed_at timestamptz
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
      owner.owner_email,
      c.phone,
      c.country,
      c.language,
      coalesce(c.marketing_consent, false),
      c.marketing_consent_at,
      c.consent_source,
      c.unsubscribed_at
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

-- -----------------------------------------------------------------------------
-- 5. Droits d'exécution
-- -----------------------------------------------------------------------------

revoke all on function public.admin_upsert_organization_contact(uuid, text, text, text) from public, anon;
revoke all on function public.admin_set_marketing_consent(uuid, boolean, text) from public, anon;
revoke all on function public.admin_list_commercial_contacts(integer, integer, text) from public, anon;
revoke all on function public.admin_list_commercial_contacts_for_export() from public, anon;

grant execute on function public.admin_upsert_organization_contact(uuid, text, text, text) to authenticated;
grant execute on function public.admin_set_marketing_consent(uuid, boolean, text) to authenticated;
grant execute on function public.admin_list_commercial_contacts(integer, integer, text) to authenticated;
grant execute on function public.admin_list_commercial_contacts_for_export() to authenticated;

commit;
