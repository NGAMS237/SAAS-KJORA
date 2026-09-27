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
--   • Non exécutable localement (pas de Postgres éphémère dans ce bac à
--     sable) : ce changement est livré comme « terminé, non vérifié
--     empiriquement » dans le rapport final, comme le reste de ce mandat.
--
-- Volontairement DIFFÉRÉ, hors périmètre de ce sous-lot :
--   • Aucune UI self-service (Owner/locataire) n'est modifiée pour afficher
--     un message dédié « Organization suspendue » — seul le statut brut,
--     déjà lisible par `authenticated` depuis lot_5b, change de valeur.
--   • La révocation de session (auth.sessions) reste un « best effort » :
--     jamais testée contre un Postgres réel dans ce bac à sable, elle échoue
--     silencieusement (sans jamais bloquer la désactivation du membre) si le
--     rôle propriétaire des fonctions n'a pas les privilèges nécessaires sur
--     le schéma `auth`. Le cœur de la désactivation — memberships.status
--     ='revoked', qui coupe immédiatement has_capability — ne dépend jamais
--     de la réussite de cette étape annexe.
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
-- 5. Révocation de session — best effort, jamais bloquant
-- -----------------------------------------------------------------------------
-- Non vérifiable localement (pas de Postgres exécutable dans ce bac à sable) :
-- si le rôle propriétaire de cette fonction n'a pas les privilèges nécessaires
-- sur le schéma `auth`, l'exception est absorbée et la fonction renvoie
-- simplement `false` — la désactivation du membre (memberships.status
-- ='revoked', qui coupe immédiatement has_capability) n'en dépend jamais.

create or replace function private.best_effort_revoke_sessions(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    delete from auth.sessions where user_id = target_user_id;
    return true;
  exception when others then
    return false;
  end;
end;
$$;

revoke all on function private.best_effort_revoke_sessions(uuid) from public, anon, authenticated;

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
  sessions_revoked boolean;
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

  update public.memberships set status = 'revoked', revoked_at = now() where id = membership.id;

  -- Best effort, jamais bloquant — voir §5 et la note en tête de fichier.
  sessions_revoked := private.best_effort_revoke_sessions(membership.user_id);

  perform private.write_administrative_audit(
    target_organization_id, 'member.disabled_by_admin', membership.user_id, membership.id, null,
    jsonb_build_object('role', membership.role, 'reason', trim(p_reason), 'sessionsRevoked', sessions_revoked)
  );

  return jsonb_build_object('outcome', 'disabled', 'sessionsRevoked', sessions_revoked);
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

commit;
