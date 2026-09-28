begin;

-- =============================================================================
-- KJORA — REVENUE-LAUNCH-01 — Sous-lot 01H — Cycle de vie Admin
-- =============================================================================
-- NON APPLIQUÉE à ce stade (ni Dev, ni Production) — même point d'arrêt que
-- tous les lots précédents de REVENUE-LAUNCH-01.
--
-- Périmètre : suspendre/réactiver/archiver/restaurer une Organization,
-- désactiver/réactiver un membre, transférer la propriété (côté Admin, sans
-- passer par le membre lui-même), notes internes Admin, historique complet.
-- Aucune suppression définitive nulle part. Motif obligatoire sur chaque
-- action. Auteur et horodatage systématiques (via l'historique administratif
-- existant). Toute donnée reste conservée : ce lot ne fait QUE des
-- changements de statut et des ajouts, jamais un `delete`.
--
-- Réutilisation délibérée (audit préalable, voir session) — rien de neuf
-- n'est recréé quand une brique existante convient déjà :
--   • public.administrative_audit_log (lot_5c) reste la SEULE source
--     d'historique — étendue de façon additive (nouvelles valeurs `action`),
--     jamais dupliquée par une seconde table de log.
--   • public.memberships.status ('active'/'revoked', lot_5b) reste le SEUL
--     indicateur d'activation d'un membre — « désactiver un membre » réutilise
--     l'état 'revoked' déjà en place (le même que la révocation self-service),
--     jamais un second champ. L'historique (actor_user_id) distingue déjà qui
--     a agi ; nul besoin d'un état distinct pour « désactivé par un Admin ».
--   • private.write_administrative_audit(...) (lot_5c) reste l'unique point
--     d'écriture de l'historique — utilisé tel quel, sans modification.
--   • Le déclencheur privé.protect_last_organization_owner (lot_5c) protège
--     déjà, universellement, le dernier propriétaire actif contre toute
--     désactivation/suppression — y compris pour les actions Admin de ce lot,
--     sans rien y ajouter.
--
-- Nouveau, réellement nécessaire :
--   • organizations.status gagne la valeur 'archived' (seules 'active' et
--     'suspended' existaient — et AUCUNE RPC ne positionnait jamais
--     'suspended' avant ce lot : un vrai manque, comblé ici).
--   • organizations gagne suspended_at/archived_at/status_reason — jamais
--     exposés à l'Organization elle-même (seule la colonne `status` l'est
--     déjà, lot_5b) : le motif interne reste un détail Admin, pas un message
--     adressé au client.
--   • public.admin_organization_notes — notes internes Admin, jamais visibles
--     de l'Organization (RLS activée, aucune policy, tout accès passe par les
--     RPC ci-dessous — même schéma que commercial_interventions,
--     ADMIN-BILLING-OPS-01).
--   • Huit RPC Admin (suspend/reactivate/archive/restore Organization,
--     disable/reactivate member, transfer ownership, add note) + deux RPC de
--     lecture Admin (liste des membres, historique) dédiées à la console —
--     JAMAIS un doublon du RPC self-service : `transfer_organization_ownership`
--     (lot_5c) exige que l'appelant SOIT le propriétaire actif, structurellement
--     inutilisable par un Admin agissant pour le compte d'autrui ; la version
--     Admin ci-dessous en reprend la même validation (cible active, courriel
--     vérifié) sans cette contrainte d'appelant.
--
-- Décision délibérée, documentée ici plutôt que silencieuse (autorisation
-- REVENUE-LAUNCH-01 : « décisions techniques minimales, sûres et
-- réversibles ») — private.has_capability (lot_5c) fait désormais AUSSI
-- vérifier que l'Organization est 'active' :
--   • Sans ce filtre, « suspendre » une Organization ne changeait RIEN pour
--     ses membres : has_capability ne lit jamais organizations.status
--     aujourd'hui (vérifié par grep sur tout le schéma et sur
--     src/core/authorization/server.ts) — suspendre resterait une étiquette
--     cosmétique, pas une vraie mise en veille.
--   • Le risque « surface universelle » a été mesuré, pas supposé : cette
--     fonction est le SEUL point d'entrée utilisé par ~25 RLS/RPC à travers
--     tout le schéma (memberships, tenancy, finance, documents, operations,
--     billing…) — modifier son corps plutôt que chaque appelant est justement
--     ce qui rend le changement minimal et centralisé, pas plus risqué.
--   • Non-régression vérifiée par grep sur l'ensemble des fixtures pgTAP et
--     des tests Node existants : AUCUN test n'insère une Organization
--     'suspended' puis n'attend un accès réussi (le seul test qui référence
--     'suspended', rls_admin_01_1_ux_quick_wins.test.sql, ne teste qu'un
--     FILTRE de liste Admin, jamais l'autorisation d'un membre). Pour toute
--     ligne existante ('active' par défaut, seule valeur jamais produite par
--     du code applicatif avant ce lot), la clause ajoutée est trivialement
--     vraie : comportement inchangé partout où aucune Organization n'est
--     encore suspendue/archivée.
--   • Lecture Admin non affectée : les RPC Admin (admin_get_organization_detail
--     et celles de ce lot) passent par private.assert_platform_admin(), jamais
--     par has_capability — un Admin garde donc une visibilité complète sur une
--     Organization suspendue/archivée pour la gérer.
--   • Lecture propre à l'Organization non affectée : "members can read their
--     organizations"/"...organization profiles" (lot_5b) utilisent
--     private.is_active_member/is_organization_owner, des fonctions
--     DISTINCTES, non modifiées par ce lot — un membre d'une Organization
--     suspendue continue donc de voir qu'elle existe et son statut, jamais un
--     écran cassé, mais perd tout accès aux capacités métier (property.*,
--     tenant.*, lease.*, billing.*, member.*…) tant qu'elle n'est pas
--     réactivée.
--   • Vérifié par exécution réelle (PostgreSQL 16 + pgtap, cluster local
--     éphémère, jamais Supabase distant) : voir
--     supabase/tests/database/rls_revenue_01h_admin_lifecycle.test.sql et
--     rls_revenue_lifecycle_matrix.test.sql.
--
-- Exceptions ÉTROITES d'une Organization SUSPENDUE (décision REVENUE-LAUNCH-01
-- v3), jamais par has_capability — voir private.has_restricted_capability
-- (REVENUE-01B, section 0) :
--   • facturation en lecture (billing.view) pour régulariser ;
--   • export en lecture seule pour le SEUL Owner actif (section 13) — CSV/XLSX
--     uniquement, jamais le ZIP (qui matérialise des PDF, donc écrit) ;
--   • aide/support et identité minimale (statut, nom) : déjà servies par
--     is_active_member (lot_5b) et par list_my_restricted_organizations
--     (section 12), qui n'expose JAMAIS status_reason ni une note Admin.
-- Organization ARCHIVÉE : aucune exception (restauration Admin préalable).
-- Portail locataire : fermé pour une Organization suspendue ou archivée
-- (section 14) — aucune exception pour les locataires.
--
-- Sessions : ce lot ne touche JAMAIS auth.sessions (aucune suppression,
-- aucune écriture dans le schéma interne de Supabase Auth). La désactivation
-- d'un membre coupe l'accès immédiatement par memberships.status = 'revoked'
-- (has_capability / is_active_member lisent ce statut à chaque requête),
-- indépendamment de la validité d'un jeton déjà émis ; une révocation de
-- session, si elle devient nécessaire, relève de l'API Admin Auth depuis du
-- code serveur. Désactiver un membre n'affecte ni son compte auth.users ni
-- ses memberships dans d'autres Organizations.
--
-- Volontairement DIFFÉRÉ, hors périmètre de ce sous-lot :
--   • Restaurer une Organization archivée la ramène toujours à 'active'
--     (jamais à 'suspended', même si c'était son statut juste avant
--     l'archivage) : une simplification délibérée — un Admin qui veut la
--     resuspendre après restauration le fait en un second appel explicite,
--     plutôt que ce lot ne devine un historique de statut.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schéma — Organization : statut 'archived', horodatages, motif interne
-- -----------------------------------------------------------------------------

alter table public.organizations
  add column suspended_at timestamptz,
  add column archived_at timestamptz,
  add column status_reason text
    check (status_reason is null or char_length(trim(status_reason)) between 3 and 500);

alter table public.organizations drop constraint organizations_status_check;
alter table public.organizations
  add constraint organizations_status_check check (status in ('active', 'suspended', 'archived'));

comment on column public.organizations.suspended_at is
  'Horodatage de la dernière suspension Admin (REVENUE-01H). Effacé à la réactivation.';
comment on column public.organizations.archived_at is
  'Horodatage du dernier archivage Admin (REVENUE-01H). Effacé à la restauration.';
comment on column public.organizations.status_reason is
  'Motif interne Admin du statut courant (REVENUE-01H). Jamais exposé à `authenticated` : seule la colonne `status` (lot_5b) l''est.';

-- -----------------------------------------------------------------------------
-- 2. Schéma — Notes internes Admin (jamais visibles de l'Organization)
-- -----------------------------------------------------------------------------

create table public.admin_organization_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  author_user_id uuid not null references auth.users (id),
  note text not null check (char_length(trim(note)) between 3 and 2000),
  created_at timestamptz not null default now()
);

create index admin_organization_notes_organization_idx
  on public.admin_organization_notes (organization_id, created_at desc);

alter table public.admin_organization_notes enable row level security;
-- Aucune policy : exactement le schéma de public.commercial_interventions
-- (ADMIN-BILLING-OPS-01) — tout accès passe par les RPC `security definer`
-- ci-dessous, jamais par une lecture/écriture directe de la table.
revoke all on public.admin_organization_notes from anon, authenticated;

comment on table public.admin_organization_notes is
  'Notes internes Admin sur une Organization (REVENUE-01H). Jamais exposées à l''Organization elle-même — accès exclusivement via les RPC admin_*.';

-- -----------------------------------------------------------------------------
-- 3. Historique — extension additive de administrative_audit_log.action
-- -----------------------------------------------------------------------------

alter table public.administrative_audit_log drop constraint administrative_audit_log_action_check;
alter table public.administrative_audit_log add constraint administrative_audit_log_action_check check (action in (
  'member.invited','member.invitation_resent','member.invitation_revoked','member.invitation_accepted',
  'member.role_changed','member.revoked','owner.transferred','payment.reversed','document.invalidated',
  'tenant_portal.invited','tenant_portal.invitation_resent','tenant_portal.invitation_accepted',
  'tenant_portal.revoked','tenant_portal.reactivated','contract.generated','contract.validated',
  'contract.owner_signed','contract.sent','contract.tenant_viewed','contract.tenant_signed',
  'contract.finalized','contract.cancelled',
  -- REVENUE-01H — actions Admin (cycle de vie Organization/membre).
  'organization.suspended','organization.reactivated','organization.archived','organization.restored',
  'member.disabled_by_admin','member.reactivated_by_admin','owner.transferred_by_admin','admin.note_added'
));

-- -----------------------------------------------------------------------------
-- 4. private.has_capability — ajout du filtre organizations.status = 'active'
-- -----------------------------------------------------------------------------
-- Voir la note en tête de fichier pour la justification complète et les
-- vérifications de non-régression effectuées. Signature strictement
-- inchangée : `create or replace`, aucun appelant (RLS/RPC) n'a besoin d'être
-- touché.

create or replace function private.has_capability(
  target_organization_id uuid,
  requested_capability text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_capabilities rc on rc.role = m.role
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = target_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and o.status = 'active'
      and rc.capability = requested_capability
  );
$$;

-- -----------------------------------------------------------------------------
-- 5. Sessions — aucune écriture dans le schéma auth (voir l'en-tête)
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 6. RPC Admin — cycle de vie Organization
-- -----------------------------------------------------------------------------

create or replace function public.admin_suspend_organization(
  target_organization_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  org public.organizations;
begin
  perform private.assert_platform_admin();

  select * into org from public.organizations where id = target_organization_id for update;
  if org.id is null then
    return jsonb_build_object('outcome', 'organization_not_found');
  end if;

  if p_reason is null or char_length(trim(p_reason)) < 3 then
    return jsonb_build_object('outcome', 'reason_required');
  end if;

  if org.status = 'archived' then
    return jsonb_build_object('outcome', 'organization_archived');
  end if;
  -- Idempotent : un second appel sur une Organization déjà suspendue ne fait
  -- rien de plus, sans jamais renvoyer une erreur pour une double soumission.
  if org.status = 'suspended' then
    return jsonb_build_object('outcome', 'already_suspended');
  end if;

  update public.organizations
     set status = 'suspended', suspended_at = now(), status_reason = trim(p_reason)
   where id = target_organization_id;

  perform private.write_administrative_audit(
    target_organization_id, 'organization.suspended', null, null, null,
    jsonb_build_object('reason', trim(p_reason))
  );

  return jsonb_build_object('outcome', 'suspended');
end;
$$;

create or replace function public.admin_reactivate_organization(
  target_organization_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  org public.organizations;
begin
  perform private.assert_platform_admin();

  select * into org from public.organizations where id = target_organization_id for update;
  if org.id is null then
    return jsonb_build_object('outcome', 'organization_not_found');
  end if;

  if p_reason is null or char_length(trim(p_reason)) < 3 then
    return jsonb_build_object('outcome', 'reason_required');
  end if;

  if org.status = 'archived' then
    return jsonb_build_object('outcome', 'organization_archived');
  end if;
  if org.status = 'active' then
    return jsonb_build_object('outcome', 'already_active');
  end if;

  update public.organizations
     set status = 'active', suspended_at = null, status_reason = null
   where id = target_organization_id;

  perform private.write_administrative_audit(
    target_organization_id, 'organization.reactivated', null, null, null,
    jsonb_build_object('reason', trim(p_reason))
  );

  return jsonb_build_object('outcome', 'reactivated');
end;
$$;

create or replace function public.admin_archive_organization(
  target_organization_id uuid,
  p_confirm_name text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  org public.organizations;
  profile_name text;
begin
  perform private.assert_platform_admin();

  select * into org from public.organizations where id = target_organization_id for update;
  if org.id is null then
    return jsonb_build_object('outcome', 'organization_not_found');
  end if;

  if p_reason is null or char_length(trim(p_reason)) < 3 then
    return jsonb_build_object('outcome', 'reason_required');
  end if;

  -- Idempotent avant même la vérification du nom : un second clic sur une
  -- Organization déjà archivée ne doit jamais exiger une resaisie.
  if org.status = 'archived' then
    return jsonb_build_object('outcome', 'already_archived');
  end if;

  select name into profile_name
  from public.organization_profiles where organization_id = target_organization_id;

  -- Saisie du nom obligatoire, exacte (sensible à la casse) : jamais de
  -- confirmation par simple case à cocher pour un archivage. Revalidée ici
  -- côté serveur — la case cochée côté client (ConfirmDialog) n'est jamais
  -- suffisante à elle seule.
  if p_confirm_name is null or trim(p_confirm_name) <> coalesce(profile_name, '') then
    return jsonb_build_object('outcome', 'name_confirmation_mismatch');
  end if;

  update public.organizations
     set status = 'archived', archived_at = now(), status_reason = trim(p_reason)
   where id = target_organization_id;

  perform private.write_administrative_audit(
    target_organization_id, 'organization.archived', null, null, null,
    jsonb_build_object('reason', trim(p_reason), 'confirmedName', trim(p_confirm_name))
  );

  return jsonb_build_object('outcome', 'archived');
end;
$$;

create or replace function public.admin_restore_organization(
  target_organization_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  org public.organizations;
begin
  perform private.assert_platform_admin();

  select * into org from public.organizations where id = target_organization_id for update;
  if org.id is null then
    return jsonb_build_object('outcome', 'organization_not_found');
  end if;

  if p_reason is null or char_length(trim(p_reason)) < 3 then
    return jsonb_build_object('outcome', 'reason_required');
  end if;

  if org.status <> 'archived' then
    return jsonb_build_object('outcome', 'not_archived');
  end if;

  -- Simplification délibérée et documentée (voir en-tête) : toujours 'active',
  -- jamais un retour à 'suspended'.
  update public.organizations
     set status = 'active', archived_at = null, suspended_at = null, status_reason = null
   where id = target_organization_id;

  perform private.write_administrative_audit(
    target_organization_id, 'organization.restored', null, null, null,
    jsonb_build_object('reason', trim(p_reason))
  );

  return jsonb_build_object('outcome', 'restored');
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC Admin — cycle de vie Membre
-- -----------------------------------------------------------------------------

create or replace function public.admin_disable_member(
  target_organization_id uuid,
  target_membership_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership public.memberships%rowtype;
begin
  perform private.assert_platform_admin();

  perform 1 from public.organizations where id = target_organization_id for update;
  if not found then
    return jsonb_build_object('outcome', 'organization_not_found');
  end if;

  if p_reason is null or char_length(trim(p_reason)) < 3 then
    return jsonb_build_object('outcome', 'reason_required');
  end if;

  select * into membership from public.memberships
    where id = target_membership_id and organization_id = target_organization_id
    for update;
  if membership.id is null then
    return jsonb_build_object('outcome', 'membership_not_found');
  end if;

  -- Idempotent : un second appel sur un membre déjà désactivé ne fait rien
  -- de plus (par l'Admin ou par l'Organization elle-même — l'historique,
  -- pas ce champ, distingue qui a agi).
  if membership.status = 'revoked' then
    return jsonb_build_object('outcome', 'already_disabled');
  end if;

  -- Même règle que le self-service (revoke_membership, lot_5c_owner_hardening) :
  -- un propriétaire ne se désactive jamais directement, il se transfère.
  if membership.role = 'organization_owner' then
    return jsonb_build_object('outcome', 'owner_transfer_required');
  end if;

  -- Une seule ligne memberships (cette Organization) : jamais le compte
  -- auth.users, jamais les memberships de l'utilisateur ailleurs, jamais le
  -- schéma auth.
  update public.memberships set status = 'revoked', revoked_at = now() where id = membership.id;

  perform private.write_administrative_audit(
    target_organization_id, 'member.disabled_by_admin', membership.user_id, membership.id, null,
    jsonb_build_object('role', membership.role, 'reason', trim(p_reason))
  );

  return jsonb_build_object('outcome', 'disabled');
end;
$$;

create or replace function public.admin_reactivate_member(
  target_organization_id uuid,
  target_membership_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership public.memberships%rowtype;
begin
  perform private.assert_platform_admin();

  perform 1 from public.organizations where id = target_organization_id for update;
  if not found then
    return jsonb_build_object('outcome', 'organization_not_found');
  end if;

  if p_reason is null or char_length(trim(p_reason)) < 3 then
    return jsonb_build_object('outcome', 'reason_required');
  end if;

  select * into membership from public.memberships
    where id = target_membership_id and organization_id = target_organization_id
    for update;
  if membership.id is null then
    return jsonb_build_object('outcome', 'membership_not_found');
  end if;

  if membership.status = 'active' then
    return jsonb_build_object('outcome', 'already_active');
  end if;

  update public.memberships set status = 'active', revoked_at = null where id = membership.id;

  perform private.write_administrative_audit(
    target_organization_id, 'member.reactivated_by_admin', membership.user_id, membership.id, null,
    jsonb_build_object('role', membership.role, 'reason', trim(p_reason))
  );

  return jsonb_build_object('outcome', 'reactivated');
end;
$$;

create or replace function public.admin_transfer_organization_ownership(
  target_organization_id uuid,
  target_membership_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner public.memberships%rowtype;
  target_membership public.memberships%rowtype;
begin
  perform private.assert_platform_admin();

  perform 1 from public.organizations where id = target_organization_id for update;
  if not found then
    return jsonb_build_object('outcome', 'organization_not_found');
  end if;

  if p_reason is null or char_length(trim(p_reason)) < 3 then
    return jsonb_build_object('outcome', 'reason_required');
  end if;

  select * into current_owner from public.memberships
    where organization_id = target_organization_id and role = 'organization_owner' and status = 'active'
    for update;
  if current_owner.id is null then
    -- Ne devrait normalement jamais se produire (protect_last_organization_owner,
    -- lot_5c) : traité défensivement plutôt que supposé impossible.
    return jsonb_build_object('outcome', 'no_active_owner');
  end if;

  select * into target_membership from public.memberships
    where id = target_membership_id and organization_id = target_organization_id and status = 'active'
    for update;
  if target_membership.id is null then
    return jsonb_build_object('outcome', 'membership_not_found');
  end if;

  if target_membership.user_id = current_owner.user_id then
    return jsonb_build_object('outcome', 'already_owner');
  end if;

  -- Même exigence que le self-service (transfer_organization_ownership,
  -- lot_5c) : la cible doit avoir confirmé son courriel.
  if not exists (
    select 1 from auth.users where id = target_membership.user_id and email_confirmed_at is not null
  ) then
    return jsonb_build_object('outcome', 'verified_target_required');
  end if;

  update public.memberships set role = 'organization_owner' where id = target_membership.id;
  update public.memberships set role = 'manager' where id = current_owner.id;

  perform private.write_administrative_audit(
    target_organization_id, 'owner.transferred_by_admin', target_membership.user_id, target_membership.id, null,
    jsonb_build_object('previousOwnerUserId', current_owner.user_id, 'reason', trim(p_reason))
  );

  return jsonb_build_object('outcome', 'transferred');
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC Admin — notes internes
-- -----------------------------------------------------------------------------

create or replace function public.admin_add_organization_note(
  target_organization_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_note_id uuid;
begin
  perform private.assert_platform_admin();

  perform 1 from public.organizations where id = target_organization_id;
  if not found then
    return jsonb_build_object('outcome', 'organization_not_found');
  end if;

  if p_note is null or char_length(trim(p_note)) < 3 then
    return jsonb_build_object('outcome', 'note_required');
  end if;

  insert into public.admin_organization_notes (organization_id, author_user_id, note)
  values (target_organization_id, (select auth.uid()), trim(p_note))
  returning id into new_note_id;

  perform private.write_administrative_audit(
    target_organization_id, 'admin.note_added', null, null, null,
    jsonb_build_object('noteId', new_note_id)
  );

  return jsonb_build_object('outcome', 'note_added', 'noteId', new_note_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. RPC Admin — lectures (membres, historique, notes)
-- -----------------------------------------------------------------------------
-- Distinctes des RPC self-service (list_organization_members,
-- list_administrative_audit, lot_5c) : celles-ci exigent
-- has_capability(...,'member.view'/'audit.view'), donc une appartenance à
-- l'Organization — structurellement inutilisable depuis la console Admin, où
-- l'opérateur n'est presque jamais membre de l'Organization qu'il consulte.
-- Ces RPC Admin passent par assert_platform_admin, comme
-- admin_get_organization_detail (ADMIN-BILLING-OPS-01).

create or replace function public.admin_list_organization_members(
  target_organization_id uuid
)
returns table (
  membership_id uuid,
  user_id uuid,
  email text,
  role text,
  status text,
  created_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  return query
    select m.id, m.user_id, u.email::text, m.role, m.status, m.created_at, m.revoked_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = target_organization_id
    order by (m.role = 'organization_owner') desc, (m.status = 'active') desc, lower(coalesce(u.email, '')), m.created_at;
end;
$$;

create or replace function public.admin_list_administrative_audit(
  target_organization_id uuid,
  result_limit integer default 50
)
returns table (
  audit_id uuid,
  action text,
  actor_email text,
  target_email text,
  details jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  return query
    select a.id, a.action,
      (select email::text from auth.users where id = a.actor_user_id),
      (select email::text from auth.users where id = a.target_user_id),
      a.details, a.created_at
    from public.administrative_audit_log a
    where a.organization_id = target_organization_id
    order by a.created_at desc
    limit greatest(1, least(coalesce(result_limit, 50), 200));
end;
$$;

create or replace function public.admin_list_organization_notes(
  target_organization_id uuid
)
returns table (
  note_id uuid,
  author_email text,
  note text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  return query
    select n.id, u.email::text, n.note, n.created_at
    from public.admin_organization_notes n
    join auth.users u on u.id = n.author_user_id
    where n.organization_id = target_organization_id
    order by n.created_at desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. Droits d'exécution
-- -----------------------------------------------------------------------------
-- Même schéma que ADMIN-BILLING-OPS-01 : `authenticated` reçoit
-- `execute` sur toutes ces RPC, la vraie barrière étant l'appel interne à
-- private.assert_platform_admin() (échec 42501 pour quiconque n'est pas
-- platform_admin).

revoke all on function public.admin_suspend_organization(uuid, text) from public, anon;
revoke all on function public.admin_reactivate_organization(uuid, text) from public, anon;
revoke all on function public.admin_archive_organization(uuid, text, text) from public, anon;
revoke all on function public.admin_restore_organization(uuid, text) from public, anon;
revoke all on function public.admin_disable_member(uuid, uuid, text) from public, anon;
revoke all on function public.admin_reactivate_member(uuid, uuid, text) from public, anon;
revoke all on function public.admin_transfer_organization_ownership(uuid, uuid, text) from public, anon;
revoke all on function public.admin_add_organization_note(uuid, text) from public, anon;
revoke all on function public.admin_list_organization_members(uuid) from public, anon;
revoke all on function public.admin_list_administrative_audit(uuid, integer) from public, anon;
revoke all on function public.admin_list_organization_notes(uuid) from public, anon;

grant execute on function public.admin_suspend_organization(uuid, text) to authenticated;
grant execute on function public.admin_reactivate_organization(uuid, text) to authenticated;
grant execute on function public.admin_archive_organization(uuid, text, text) to authenticated;
grant execute on function public.admin_restore_organization(uuid, text) to authenticated;
grant execute on function public.admin_disable_member(uuid, uuid, text) to authenticated;
grant execute on function public.admin_reactivate_member(uuid, uuid, text) to authenticated;
grant execute on function public.admin_transfer_organization_ownership(uuid, uuid, text) to authenticated;
grant execute on function public.admin_add_organization_note(uuid, text) to authenticated;
grant execute on function public.admin_list_organization_members(uuid) to authenticated;
grant execute on function public.admin_list_administrative_audit(uuid, integer) to authenticated;
grant execute on function public.admin_list_organization_notes(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 11. Console Admin — compteurs et fiche Organization (versions finales)
-- -----------------------------------------------------------------------------
-- Fonctions ADMIN-01.1 / ADMIN-BILLING-OPS-01 remplacées UNE seule fois dans
-- toute la série REVENUE-LAUNCH-01, ici, là où le statut 'archived' naît :
--   • admin_platform_counters : + organizations_archived (total = active +
--     suspended + archived, jamais une Organization perdue en silence) et
--     organizations_requiring_provider_action ;
--   • admin_get_organization_detail : + providerActionRequired — signal
--     d'incohérence (Organization gelée, abonnement fournisseur non annulé),
--     jamais une annulation automatique (aucun appel fournisseur réel).

create or replace function public.admin_platform_counters()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.assert_platform_admin();

  select jsonb_build_object(
    'organizations_total',     (select count(*) from public.organizations),
    'organizations_active',    (select count(*) from public.organizations where status = 'active'),
    'organizations_suspended', (select count(*) from public.organizations where status = 'suspended'),
    -- REVENUE-LAUNCH-01 : sans cette clé, une Organization
    -- archivée restait comptée dans organizations_total mais dans AUCUNE
    -- ventilation par statut — total = active + suspended + archived est
    -- désormais vérifiable, et vérifié par pgTAP (§8).
    'organizations_archived',  (select count(*) from public.organizations where status = 'archived'),

    -- Abonnements RÉELLEMENT enregistrés uniquement (organization_subscriptions).
    'subscriptions_free', (select count(*) from public.organization_subscriptions where plan = 'decouverte'),
    'subscriptions_paid', (select count(*) from public.organization_subscriptions where plan <> 'decouverte'),

    -- Ni gratuite ni payante : aucune ligne de facturation n'existe pour elle.
    'organizations_without_subscription', (
      select count(*) from public.organizations o
      where not exists (
        select 1 from public.organization_subscriptions s where s.organization_id = o.id
      )
    ),

    -- Incohérence RÉELLEMENT mesurée : une Organization a une ligne
    -- organization_subscriptions ET son classement gratuit/payant n'y
    -- correspond pas à celui de son forfait effectif (organization_plans).
    'plan_billing_mismatches', (
      select count(*)
      from public.organization_subscriptions s
      join public.organization_plans p on p.organization_id = s.organization_id
      where (p.plan = 'decouverte') <> (s.plan = 'decouverte')
    ),

    -- REVENUE-LAUNCH-01 : Organizations suspendues/archivées
    -- dont l'abonnement est encore lié à un provider réel non annulé — jamais
    -- annulé automatiquement (aucun appel fournisseur réel n'est autorisé),
    -- ce compteur EXPOSE l'incohérence pour une action manuelle. Un abonnement
    -- 'free' n'a jamais de provider (contrainte subscription_free_has_no_provider,
    -- ALIGN-03) : sans intérêt ici par construction.
    'organizations_requiring_provider_action', (
      select count(*)
      from public.organizations o
      join public.organization_subscriptions s on s.organization_id = o.id
      where o.status <> 'active'
        and s.provider is not null
        and s.status <> 'cancelled'
    ),

    'subscriptions_by_status', coalesce((
      select jsonb_object_agg(status, n)
      from (
        select status, count(*) as n
        from public.organization_subscriptions
        group by status
      ) s
    ), '{}'::jsonb),
    'subscriptions_by_plan', coalesce((
      select jsonb_object_agg(plan, n)
      from (
        select plan, count(*) as n
        from public.organization_subscriptions
        group by plan
      ) p
    ), '{}'::jsonb),
    'generated_at', now()
  )
  into result;

  return result;
end;
$$;

revoke all on function public.admin_platform_counters() from public, anon;
grant execute on function public.admin_platform_counters() to authenticated;

create or replace function public.admin_get_organization_detail(
  target_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  org      public.organizations;
  profile  public.organization_profiles;
  sub      public.organization_subscriptions;
  eff_plan text;
  owner_email text;
  active_members int;
  properties_count int;
  units_count int;
  active_intervention jsonb;
  recent_events jsonb;
  fallback_plan text;
  mismatch boolean;
  provider_action_required boolean;
begin
  perform private.assert_platform_admin();

  select * into org from public.organizations where id = target_organization_id;
  if org.id is null then
    return jsonb_build_object('found', false);
  end if;

  select * into profile from public.organization_profiles where organization_id = target_organization_id;
  select * into sub from public.organization_subscriptions where organization_id = target_organization_id;

  select coalesce(op.plan, 'decouverte') into eff_plan
  from public.organization_plans op where op.organization_id = target_organization_id;
  eff_plan := coalesce(eff_plan, 'decouverte');

  select u.email::text into owner_email
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.organization_id = target_organization_id
    and m.role = 'organization_owner' and m.status = 'active'
  order by m.created_at asc
  limit 1;

  select count(*) into active_members
  from public.memberships where organization_id = target_organization_id and status = 'active';

  select count(*) into properties_count
  from public.properties where organization_id = target_organization_id and status = 'active';

  select count(*) into units_count
  from public.units where organization_id = target_organization_id and status = 'active';

  select jsonb_build_object(
    'interventionId', ci.id,
    'interventionType', ci.intervention_type,
    'reasonCode', ci.reason_code,
    'adminNote', ci.admin_note,
    'grantedPlan', ci.granted_plan,
    'startsOn', ci.starts_on,
    'endsOn', ci.ends_on,
    'currency', ci.currency,
    'amountMinor', ci.amount_minor,
    'manualReference', ci.manual_reference,
    'createdByEmail', (select email::text from auth.users where id = ci.created_by),
    'createdAt', ci.created_at,
    'extensionCount', ci.extension_count,
    'effectivelyExpired', (ci.ends_on is not null and ci.ends_on < current_date)
  )
  into active_intervention
  from public.commercial_interventions ci
  where ci.organization_id = target_organization_id and ci.status = 'active'
  order by ci.created_at desc
  limit 1;

  select coalesce(jsonb_agg(row_to_json(e)), '[]'::jsonb) into recent_events
  from (
    select
      be.id as event_id,
      be.event_type,
      be.payload,
      be.created_at,
      u.email::text as actor_email
    from public.billing_events be
    left join auth.users u on u.id = be.actor_user_id
    where be.organization_id = target_organization_id
      and be.event_type like 'admin_commercial_%'
    order by be.created_at desc
    limit 20
  ) e;

  fallback_plan := coalesce(sub.plan, 'decouverte');
  mismatch := (eff_plan <> fallback_plan) and (active_intervention is null);

  -- REVENUE-LAUNCH-01 : signal d'incohérence, jamais une
  -- annulation automatique. Vrai uniquement si l'Organization est
  -- suspendue/archivée ET que son abonnement est encore lié à un provider réel
  -- non annulé (voir admin_platform_counters, même formule).
  provider_action_required := org.status <> 'active'
    and sub.provider is not null
    and sub.status <> 'cancelled';

  return jsonb_build_object(
    'found', true,
    'organizationId', org.id,
    'name', coalesce(profile.name, ''),
    'status', org.status,
    'createdAt', org.created_at,
    'ownerEmail', owner_email,
    'activeMemberCount', active_members,
    'propertiesCount', properties_count,
    'unitsCount', units_count,
    'effectivePlan', eff_plan,
    'subscription', case when sub.organization_id is null then
      jsonb_build_object('exists', false, 'status', 'free', 'plan', 'decouverte',
        'billingCycle', 'monthly', 'currency', 'XAF', 'provider', null)
    else
      jsonb_build_object(
        'exists', true,
        'status', sub.status,
        'plan', sub.plan,
        'billingCycle', sub.billing_cycle,
        'currency', sub.currency,
        'currentPeriodEnd', sub.current_period_end,
        'renewalDate', sub.renewal_date,
        'provider', sub.provider)
    end,
    'planBillingMismatch', mismatch,
    'providerActionRequired', provider_action_required,
    'activeIntervention', active_intervention,
    'recentAdminEvents', recent_events
  );
end;
$$;

revoke all on function public.admin_get_organization_detail(uuid) from public, anon;
grant execute on function public.admin_get_organization_detail(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 12. Contexte limité — Organizations suspendues/archivées de l'appelant
-- -----------------------------------------------------------------------------
-- Sert l'écran « Organization suspendue » : identité minimale (nom), statut
-- et droits restreints effectifs. Ne renvoie JAMAIS status_reason, une note
-- Admin, un auteur ou une date d'action Admin. Uniquement les appartenances
-- ACTIVES de l'appelant lui-même (aucun paramètre : impossible de sonder une
-- autre Organization).

create or replace function public.list_my_restricted_organizations()
returns table (
  organization_id uuid,
  organization_name text,
  organization_status text,
  role text,
  can_view_billing boolean,
  can_export boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id,
         coalesce(p.name, '')::text,
         o.status::text,
         m.role::text,
         private.has_restricted_capability(o.id, 'billing.view'),
         private.has_restricted_capability(o.id, 'data_export.manage')
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
    left join public.organization_profiles p on p.organization_id = o.id
   where m.user_id = (select auth.uid())
     and m.status = 'active'
     and o.status in ('suspended', 'archived')
   order by p.name nulls last, o.id;
$$;

revoke all on function public.list_my_restricted_organizations() from public, anon;
grant execute on function public.list_my_restricted_organizations() to authenticated;

-- -----------------------------------------------------------------------------
-- 13. Export du propriétaire d'une Organization suspendue — lecture seule
-- -----------------------------------------------------------------------------
-- Politique décidée (REVENUE-LAUNCH-01 v3) :
--   • active     : export selon les droits normaux (EXPORT-01, inchangé) ;
--   • suspendue  : SEUL l'organization_owner actif, lecture seule, CSV/XLSX ;
--                  collaborateurs et locataires : aucune exception ;
--   • archivée   : aucun export self-service (restauration Admin préalable).
--
-- Les lectures EXPORT-01 d'une Organization active passent par la RLS de
-- chaque table (has_capability), volontairement inchangée — elle reste
-- fermée pour une Organization suspendue. Le propriétaire d'une Organization
-- suspendue lit donc ses données par une RPC DÉDIÉE et nommée comme telle,
-- export_restricted_owner_source, qui ne sert que ce cas : garde
-- has_restricted_capability('data_export.manage') (Owner actif + statut
-- 'suspended'), entitlement exports_standard, filtre organization_id
-- explicite sur chaque source, aucune écriture.
--
-- Le ZIP (documents PDF) est refusé pour une Organization suspendue : il
-- matérialise des PDF en stockage (écriture) — incompatible avec « strictement
-- en lecture seule ».

drop policy if exists "authorized owners read data exports" on public.data_exports;
create policy "authorized owners read data exports"
on public.data_exports for select to authenticated
using ((select private.can_export_organization_data(organization_id)));

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
  org_status text;
begin
  if not (select private.can_export_organization_data(target_organization_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_format not in ('csv', 'xlsx', 'zip') then
    raise exception 'invalid_export_format' using errcode = '22023';
  end if;
  select status into org_status from public.organizations where id = target_organization_id;
  if org_status = 'suspended' and target_format = 'zip' then
    raise exception 'export_format_unavailable_while_suspended' using errcode = '22023';
  end if;
  if target_scope is null or array_length(target_scope, 1) is null or array_length(target_scope, 1) > 20 then
    raise exception 'invalid_export_scope' using errcode = '22023';
  end if;
  if target_range_to is not null and target_range_from is not null and target_range_to < target_range_from then
    raise exception 'invalid_export_range' using errcode = '22023';
  end if;

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

create or replace function public.record_data_export_download(target_export_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare selected public.data_exports%rowtype;
begin
  select * into selected from public.data_exports where id = target_export_id;
  if selected.id is null or not (select private.can_export_organization_data(selected.organization_id)) then
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

create or replace function public.export_restricted_owner_source(
  target_organization_id uuid,
  target_source text,
  target_range_from date default null,
  target_range_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  -- Garde étroite : Owner actif d'une Organization SUSPENDUE uniquement. Une
  -- Organization active passe par EXPORT-01 (RLS) ; une archivée n'a rien.
  if not (select private.has_restricted_capability(target_organization_id, 'data_export.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not (select private.check_plan_feature(target_organization_id, 'exports_standard')) then
    raise exception 'PLAN_FEATURE_NOT_AVAILABLE' using errcode = 'P0001',
      detail = json_build_object('plan', null, 'quota', null, 'current', 0)::text;
  end if;

  if target_source = 'properties' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at, r.id), '[]'::jsonb) into result from (
      select id, name, locality, type, status, created_at
        from public.properties where organization_id = target_organization_id) r;
  elsif target_source = 'units' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at, r.id), '[]'::jsonb) into result from (
      select id, property_id, label, type, area_sqm, status, reference_rent_xaf, created_at
        from public.units where organization_id = target_organization_id) r;
  elsif target_source = 'tenants' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at, r.id), '[]'::jsonb) into result from (
      select id, full_name, phone, email, preferred_language, created_at
        from public.tenants where organization_id = target_organization_id) r;
  elsif target_source = 'leases' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at, r.id), '[]'::jsonb) into result from (
      select id, property_id, unit_id, tenant_id, status, start_date, end_date, base_rent_xaf,
             recurring_charges_xaf, periodic_total_xaf, security_deposit_xaf, billing_frequency,
             due_day, created_at
        from public.leases where organization_id = target_organization_id) r;
  elsif target_source = 'dues' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.due_date, r.id), '[]'::jsonb) into result from (
      select id, lease_id, tenant_id, kind, reference, period_start, period_end, due_date,
             rent_amount_xaf, recurring_charges_amount_xaf, deposit_amount_xaf, adjustment_amount_xaf,
             adjustment_direction, expected_amount_xaf, remaining_amount_xaf, derived_status, created_at
        from public.dues_with_status
       where organization_id = target_organization_id
         and (target_range_from is null or due_date >= target_range_from)
         and (target_range_to is null or due_date <= target_range_to)) r;
  elsif target_source = 'payments' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.payment_date, r.id), '[]'::jsonb) into result from (
      select id, lease_id, tenant_id, reference, amount_xaf, currency, payment_date, method, status, created_at
        from public.payments
       where organization_id = target_organization_id
         and (target_range_from is null or payment_date >= target_range_from)
         and (target_range_to is null or payment_date <= target_range_to)) r;
  elsif target_source = 'payment_allocations' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at, r.id), '[]'::jsonb) into result from (
      select id, payment_id, due_id, lease_id, tenant_id, amount_xaf, rent_amount_xaf,
             recurring_charges_amount_xaf, deposit_amount_xaf, adjustment_amount_xaf, created_at
        from public.payment_allocations where organization_id = target_organization_id) r;
  elsif target_source = 'credits' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.occurred_on, r.id), '[]'::jsonb) into result from (
      select id, lease_id, tenant_id, entry_type, reference, occurred_on, credit_xaf, created_at
        from public.ledger_entries
       where organization_id = target_organization_id and credit_xaf > 0
         and entry_type in ('opening_credit', 'payment')
         and (target_range_from is null or occurred_on >= target_range_from)
         and (target_range_to is null or occurred_on <= target_range_to)) r;
  elsif target_source = 'deposit_dues' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at, r.id), '[]'::jsonb) into result from (
      select id, lease_id, tenant_id, deposit_amount_xaf, due_date, created_at
        from public.dues where organization_id = target_organization_id and kind = 'deposit') r;
  elsif target_source = 'deposit_adjustments' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at, r.id), '[]'::jsonb) into result from (
      select a.id, a.lease_id, a.tenant_id, a.adjusted_due_id, a.adjustment_amount_xaf,
             a.adjustment_direction, a.created_at
        from public.dues a
       where a.organization_id = target_organization_id and a.kind = 'adjustment'
         and a.adjusted_due_id in (
           select d.id from public.dues d
            where d.organization_id = target_organization_id and d.kind = 'deposit')) r;
  elsif target_source = 'account_statement_dues' then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into result from (
      select lease_id, tenant_id, expected_amount_xaf, remaining_amount_xaf, derived_status
        from public.dues_with_status
       where organization_id = target_organization_id and kind <> 'deposit') r;
  else
    raise exception 'invalid_export_source' using errcode = '22023';
  end if;

  return result;
end;
$$;

revoke all on function public.export_restricted_owner_source(uuid, text, date, date) from public, anon;
grant execute on function public.export_restricted_owner_source(uuid, text, date, date) to authenticated;

comment on function public.export_restricted_owner_source(uuid, text, date, date) is
  'REVENUE-LAUNCH-01 v3 : lecture seule des données d''une Organization SUSPENDUE, pour son seul Owner actif (export CSV/XLSX). Jamais utilisable pour une Organization active (EXPORT-01/RLS) ni archivée.';

-- -----------------------------------------------------------------------------
-- 14. Portail locataire — fermé pour une Organization suspendue ou archivée
-- -----------------------------------------------------------------------------
-- private.has_active_tenant_portal_access (lot_6e) est l'unique point d'entrée
-- de toutes les RPC du portail (accueil, échéances, paiements, documents,
-- contrats, notifications, chemins de stockage). Y ajouter le statut de
-- l'Organization ferme le portail uniformément — aucune exception pour les
-- locataires — et le rouvre dès la réactivation/restauration, sans toucher à
-- aucune donnée ni à l'accès lui-même (tenant_portal_accesses inchangé).

create or replace function private.has_active_tenant_portal_access(target_access_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.tenant_portal_accesses a
    join public.tenant_portal_sessions s
      on s.organization_id = a.organization_id and s.access_id = a.id and s.tenant_id = a.tenant_id
    join public.organizations o on o.id = a.organization_id
    where a.id = target_access_id and a.status = 'active' and a.user_id = (select auth.uid())
      and o.status = 'active'
      and s.user_id = (select auth.uid()) and s.auth_session_id = (select private.current_portal_auth_session_id())
      and s.revoked_at is null and s.expires_at > now()
  );
$$;

-- Message clair côté portail : les Organizations dont l'espace est
-- temporairement indisponible pour ce locataire (nom + statut uniquement,
-- jamais un motif). Aucun paramètre : l'appelant ne voit que ses accès.
create or replace function public.list_my_unavailable_tenant_portal_organizations()
returns table (organization_name text, organization_status text)
language sql stable security definer set search_path = '' as $$
  select distinct coalesce(p.name, '')::text, o.status::text
    from public.tenant_portal_accesses a
    join public.organizations o on o.id = a.organization_id
    left join public.organization_profiles p on p.organization_id = a.organization_id
   where a.user_id = (select auth.uid()) and a.status = 'active'
     and o.status <> 'active';
$$;

revoke all on function public.list_my_unavailable_tenant_portal_organizations() from public, anon;
grant execute on function public.list_my_unavailable_tenant_portal_organizations() to authenticated;

commit;
