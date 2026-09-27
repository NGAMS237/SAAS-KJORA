import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// =============================================================================
// REVENUE-LAUNCH-01 — Sous-lot 01H — Cycle de vie Admin — Tests
// =============================================================================
// Audit préalable (voir session) : organizations.status n'autorisait que
// 'active'/'suspended', et AUCUNE RPC ne positionnait jamais 'suspended' —
// « suspendre » une Organization était un manque total, jamais une simple
// étiquette cosmétique à corriger. memberships.status ('active'/'revoked')
// et administrative_audit_log (historique) existaient déjà et sont réutilisés
// tels quels, jamais dupliqués.
//
// Tous les fichiers `server-only` (server.ts, views.tsx — TSX non
// transpilable par le test runner Node — et organization-lifecycle-actions.ts,
// qui importe transitivement lib/supabase/server.ts, lui-même server-only)
// sont inspectés en texte source, jamais importés comme modules ES, exactement
// comme le reste du code server-only de ce projet (voir billing-providers.test.ts,
// section SERVER_ONLY, et revenue-01e-admin-finance-extension.test.ts).
// =============================================================================

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*--.*$/gm, "");
}

const MIGRATION = read("../supabase/migrations/20260927180000_revenue_01h_admin_lifecycle.sql");
const PGTAP = read("../supabase/tests/database/rls_revenue_01h_admin_lifecycle.test.sql");
const AUTH_SERVER = read("../src/core/authorization/server.ts");
const ADMIN_SERVER = read("../src/modules/platform-admin/server.ts");
const ADMIN_VIEWS = read("../src/modules/platform-admin/views.tsx");
const ADMIN_COPY = read("../src/modules/platform-admin/copy.ts");
const LIFECYCLE_ACTIONS = read("../src/modules/platform-admin/organization-lifecycle-actions.ts");
const ORG_PAGE = read("../src/app/administration/organizations/[organizationId]/page.tsx");
const GLOBALS_CSS = read("../src/app/globals.css");

const MIGRATION_CLEAN = sansCommentaires(MIGRATION);

// ---------------------------------------------------------------------------
// 1. Migration — enveloppe et non-application
// ---------------------------------------------------------------------------

test("la migration 01H est enveloppée begin;/commit; (convention du projet)", () => {
  assert.match(MIGRATION, /^begin;/);
  assert.match(MIGRATION, /\ncommit;\s*$/);
});

// ---------------------------------------------------------------------------
// 2. organizations — statut 'archived', horodatages, motif interne
// ---------------------------------------------------------------------------

test("organizations.status gagne 'archived' sans perdre 'active'/'suspended'", () => {
  assert.match(
    MIGRATION_CLEAN,
    /add constraint organizations_status_check check \(status in \('active', 'suspended', 'archived'\)\)/,
  );
});

test("organizations gagne suspended_at/archived_at/status_reason, jamais exposés à `authenticated`", () => {
  assert.match(MIGRATION_CLEAN, /add column suspended_at timestamptz/);
  assert.match(MIGRATION_CLEAN, /add column archived_at timestamptz/);
  assert.match(MIGRATION_CLEAN, /add column status_reason text/);
  // Non-régression : le seul grant existant sur organizations (lot_5b) reste
  // limité à (id, status) — ce lot n'ajoute aucun `grant ... on public.organizations`.
  assert.doesNotMatch(MIGRATION_CLEAN, /grant select[\s\S]{0,40}on public\.organizations to authenticated/);
});

// ---------------------------------------------------------------------------
// 3. admin_organization_notes — jamais visible de l'Organization
// ---------------------------------------------------------------------------

test("admin_organization_notes existe, RLS activée, aucun accès direct accordé", () => {
  assert.match(MIGRATION_CLEAN, /create table public\.admin_organization_notes/);
  assert.match(MIGRATION_CLEAN, /alter table public\.admin_organization_notes enable row level security/);
  assert.match(MIGRATION_CLEAN, /revoke all on public\.admin_organization_notes from anon, authenticated/);
  // Même schéma que commercial_interventions (ADMIN-BILLING-OPS-01) : aucune policy.
  assert.doesNotMatch(MIGRATION_CLEAN, /create policy[\s\S]{0,120}on public\.admin_organization_notes/);
});

// ---------------------------------------------------------------------------
// 4. administrative_audit_log — extension additive, jamais une seconde table
// ---------------------------------------------------------------------------

test("administrative_audit_log.action est étendu de façon additive (les 21 valeurs de lot_6f restent)", () => {
  const PREVIOUS_ACTIONS = [
    "member.invited", "member.invitation_resent", "member.invitation_revoked", "member.invitation_accepted",
    "member.role_changed", "member.revoked", "owner.transferred", "payment.reversed", "document.invalidated",
    "tenant_portal.invited", "tenant_portal.invitation_resent", "tenant_portal.invitation_accepted",
    "tenant_portal.revoked", "tenant_portal.reactivated", "contract.generated", "contract.validated",
    "contract.owner_signed", "contract.sent", "contract.tenant_viewed", "contract.tenant_signed",
    "contract.finalized", "contract.cancelled",
  ];
  for (const action of PREVIOUS_ACTIONS) {
    assert.ok(MIGRATION_CLEAN.includes(`'${action}'`), `valeur historique perdue : ${action}`);
  }
  const NEW_ACTIONS = [
    "organization.suspended", "organization.reactivated", "organization.archived", "organization.restored",
    "member.disabled_by_admin", "member.reactivated_by_admin", "owner.transferred_by_admin", "admin.note_added",
  ];
  for (const action of NEW_ACTIONS) {
    assert.ok(MIGRATION_CLEAN.includes(`'${action}'`), `nouvelle valeur manquante : ${action}`);
  }
  // Une seule table d'historique : jamais de second `create table ... audit`.
  assert.doesNotMatch(MIGRATION_CLEAN, /create table public\.\w*audit\w*/);
});

// ---------------------------------------------------------------------------
// 5. private.has_capability — le changement le plus sensible de ce lot
// ---------------------------------------------------------------------------

test("private.has_capability vérifie désormais aussi organizations.status = 'active', signature inchangée", () => {
  const start = MIGRATION_CLEAN.indexOf("create or replace function private.has_capability");
  assert.notEqual(start, -1);
  const body = MIGRATION_CLEAN.slice(start, MIGRATION_CLEAN.indexOf("$$;", start) + 3);
  // Signature et garanties précédentes (lot_5c) intactes.
  assert.match(body, /language sql/);
  assert.match(body, /stable/);
  assert.match(body, /security definer/);
  assert.match(body, /set search_path = ''/);
  assert.match(body, /m\.status = 'active'/);
  assert.match(body, /rc\.capability = requested_capability/);
  // Le seul ajout réel de ce lot.
  assert.match(body, /join public\.organizations o on o\.id = m\.organization_id/);
  assert.match(body, /o\.status = 'active'/);
});

test("private.is_active_member et private.is_organization_owner ne sont PAS modifiées par ce lot", () => {
  // Un membre d'une Organization suspendue doit continuer à voir qu'elle
  // existe (jamais un écran cassé) — seules les capacités métier sont coupées.
  assert.doesNotMatch(MIGRATION_CLEAN, /create or replace function private\.is_active_member/);
  assert.doesNotMatch(MIGRATION_CLEAN, /create or replace function private\.is_organization_owner/);
});

// ---------------------------------------------------------------------------
// 6. Révocation de session — best effort, jamais bloquant
// ---------------------------------------------------------------------------

test("private.best_effort_revoke_sessions absorbe toute exception et ne bloque jamais admin_disable_member", () => {
  const start = MIGRATION_CLEAN.indexOf("create or replace function private.best_effort_revoke_sessions");
  assert.notEqual(start, -1);
  const body = MIGRATION_CLEAN.slice(start, MIGRATION_CLEAN.indexOf("$$;", start) + 3);
  assert.match(body, /delete from auth\.sessions where user_id = target_user_id/);
  assert.match(body, /exception when others then/);
  assert.match(body, /return false/);

  const disableStart = MIGRATION_CLEAN.indexOf("create or replace function public.admin_disable_member");
  const disableBody = MIGRATION_CLEAN.slice(disableStart, MIGRATION_CLEAN.indexOf("$$;", disableStart) + 3);
  assert.match(disableBody, /private\.best_effort_revoke_sessions\(membership\.user_id\)/);
  // Le statut, pas la session, reste la source de vérité de la désactivation.
  assert.match(disableBody, /status = 'revoked'/);
});

// ---------------------------------------------------------------------------
// 7. Les huit RPC d'action — garde, motif obligatoire, idempotence
// ---------------------------------------------------------------------------

const ACTION_RPCS = [
  ["admin_suspend_organization", ["organization_not_found", "reason_required", "already_suspended", "suspended"]],
  ["admin_reactivate_organization", ["organization_not_found", "reason_required", "already_active", "reactivated"]],
  ["admin_archive_organization", ["organization_not_found", "reason_required", "already_archived", "name_confirmation_mismatch", "archived"]],
  ["admin_restore_organization", ["organization_not_found", "reason_required", "not_archived", "restored"]],
  ["admin_disable_member", ["organization_not_found", "reason_required", "membership_not_found", "already_disabled", "owner_transfer_required", "disabled"]],
  ["admin_reactivate_member", ["organization_not_found", "reason_required", "membership_not_found", "already_active", "reactivated"]],
  ["admin_transfer_organization_ownership", ["organization_not_found", "reason_required", "membership_not_found", "already_owner", "verified_target_required", "transferred"]],
  ["admin_add_organization_note", ["organization_not_found", "note_required", "note_added"]],
] as const;

for (const [fn, outcomes] of ACTION_RPCS) {
  test(`${fn} garde par assert_platform_admin, renvoie un jsonb avec chaque issue attendue`, () => {
    const start = MIGRATION_CLEAN.indexOf(`create or replace function public.${fn}(`);
    assert.notEqual(start, -1, `${fn} introuvable`);
    const end = MIGRATION_CLEAN.indexOf("\n$$;", start);
    const body = MIGRATION_CLEAN.slice(start, end);
    assert.match(body, /perform private\.assert_platform_admin\(\);/);
    assert.match(body, /security definer/, `${fn} doit être security definer`);
    assert.match(body, /set search_path = ''/, `${fn} doit fixer search_path`);
    for (const outcome of outcomes) {
      assert.ok(body.includes(`'${outcome}'`), `${fn} : issue manquante '${outcome}'`);
    }
  });
}

test("chaque RPC d'action REVENUE-01H valide un motif non vide (jamais un motif optionnel silencieux)", () => {
  const reasonChecks = MIGRATION_CLEAN.match(/char_length\(trim\(p_reason\)\) < 3/g) ?? [];
  // Les huit RPC ci-dessus prennent p_reason, sauf admin_add_organization_note (p_note).
  assert.equal(reasonChecks.length, 7);
});

test("aucune suppression de donnée applicative : la seule `delete from` de ce lot cible auth.sessions (révocation best-effort)", () => {
  const deletes = MIGRATION_CLEAN.match(/delete from [^\s;]+/gi) ?? [];
  assert.deepEqual(deletes, ["delete from auth.sessions"]);
});

// ---------------------------------------------------------------------------
// 8. Les trois RPC de lecture Admin
// ---------------------------------------------------------------------------

for (const fn of ["admin_list_organization_members", "admin_list_administrative_audit", "admin_list_organization_notes"]) {
  test(`${fn} est une lecture Admin dédiée (assert_platform_admin, jamais has_capability)`, () => {
    const start = MIGRATION_CLEAN.indexOf(`create or replace function public.${fn}(`);
    assert.notEqual(start, -1, `${fn} introuvable`);
    const body = MIGRATION_CLEAN.slice(start, MIGRATION_CLEAN.indexOf("$$;", start) + 3);
    assert.match(body, /perform private\.assert_platform_admin\(\);/);
    assert.match(body, /stable/);
    assert.doesNotMatch(body, /has_capability/);
  });
}

// ---------------------------------------------------------------------------
// 9. Droits d'exécution — même schéma que ADMIN-BILLING-OPS-01
// ---------------------------------------------------------------------------

test("les onze nouvelles RPC sont révoquées de public/anon et accordées à authenticated (la vraie garde reste interne)", () => {
  const ALL_NEW_RPCS = [
    "admin_suspend_organization(uuid, text)",
    "admin_reactivate_organization(uuid, text)",
    "admin_archive_organization(uuid, text, text)",
    "admin_restore_organization(uuid, text)",
    "admin_disable_member(uuid, uuid, text)",
    "admin_reactivate_member(uuid, uuid, text)",
    "admin_transfer_organization_ownership(uuid, uuid, text)",
    "admin_add_organization_note(uuid, text)",
    "admin_list_organization_members(uuid)",
    "admin_list_administrative_audit(uuid, integer)",
    "admin_list_organization_notes(uuid)",
  ];
  for (const signature of ALL_NEW_RPCS) {
    const fnName = signature.split("(")[0];
    assert.ok(
      MIGRATION_CLEAN.includes(`revoke all on function public.${signature} from public, anon;`),
      `revoke manquant pour ${fnName}`,
    );
    assert.ok(
      MIGRATION_CLEAN.includes(`grant execute on function public.${signature} to authenticated;`),
      `grant manquant pour ${fnName}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 10. Non-régression — les lots fermés ne sont jamais rouverts
// ---------------------------------------------------------------------------

test("les RPC self-service et Admin déjà livrées ne sont jamais redéfinies par ce lot", () => {
  const CLOSED_RPCS = [
    "public.revoke_membership(",
    "public.transfer_organization_ownership(",
    "public.change_membership_role(",
    "public.admin_get_organization_detail(",
    "public.admin_grant_commercial_intervention(",
    "public.admin_finance_billing_extension(",
  ];
  for (const rpc of CLOSED_RPCS) {
    assert.doesNotMatch(
      MIGRATION_CLEAN,
      new RegExp(`create or replace function ${rpc.replace(/[().]/g, "\\$&")}`),
      `${rpc} ne doit pas être redéfinie par REVENUE-01H`,
    );
  }
});

// ---------------------------------------------------------------------------
// 11. src/core/authorization/server.ts — deuxième barrière, applicative
// ---------------------------------------------------------------------------

test("isOrganizationActive lit organizations.status et ne bloque jamais sur une erreur réseau", () => {
  const start = AUTH_SERVER.indexOf("export async function isOrganizationActive");
  assert.notEqual(start, -1);
  const body = AUTH_SERVER.slice(start, AUTH_SERVER.indexOf("\n}", start));
  assert.match(body, /from\("organizations"\)/);
  assert.match(body, /\.select\("status"\)/);
  assert.match(body, /if \(error \|\| !data\) return true;/);
  assert.match(body, /return data\.status === "active";/);
});

test("requireActiveCapability bloque une Organization non active AVANT le blocage facturation, sans régression ALIGN-03", () => {
  const start = AUTH_SERVER.indexOf("export async function requireActiveCapability");
  assert.notEqual(start, -1);
  const body = AUTH_SERVER.slice(start, AUTH_SERVER.indexOf("\nexport ", start + 1) === -1
    ? AUTH_SERVER.length
    : AUTH_SERVER.indexOf("\nexport ", start + 1));
  const idxOrgActive = body.indexOf("isOrganizationActive(authorization.organizationId)");
  const idxBillingBlocked = body.indexOf("isOrganizationBillingBlocked(authorization.organizationId)");
  assert.notEqual(idxOrgActive, -1, "isOrganizationActive doit être appelée dans requireActiveCapability");
  assert.notEqual(idxBillingBlocked, -1);
  assert.ok(idxOrgActive < idxBillingBlocked, "la vérification de statut Organization doit précéder le blocage facturation");
  // Non-régression ALIGN-03 : la barrière facturation existante reste intacte.
  assert.match(body, /status: 402 as const/);
  assert.match(body, /isMutatingCapability\(requested\)/);
});

test("ALIGN-03 (CAPABILITIES_ALLOWED_WHEN_BLOCKED, isMutatingCapability) n'est pas modifié par ce lot", () => {
  assert.match(AUTH_SERVER, /CAPABILITIES_ALLOWED_WHEN_BLOCKED/);
  assert.match(AUTH_SERVER, /isMutatingCapability/);
  for (const cap of ["organization.view", "organization.profile.manage", "billing.view", "billing.manage", "data_export.manage"]) {
    assert.ok(AUTH_SERVER.includes(`"${cap}"`), `capacité non préservée : ${cap}`);
  }
});

// ---------------------------------------------------------------------------
// 12. src/modules/platform-admin — lecture, actions, vue, copie, page
// ---------------------------------------------------------------------------

test("getOrganizationLifecycle combine trois RPC Admin dédiées, jamais les RPC self-service", () => {
  const start = ADMIN_SERVER.indexOf("export async function getOrganizationLifecycle");
  assert.notEqual(start, -1);
  const body = ADMIN_SERVER.slice(start, ADMIN_SERVER.indexOf("\n}", ADMIN_SERVER.lastIndexOf("return {", ADMIN_SERVER.length)));
  assert.match(ADMIN_SERVER, /admin_list_organization_members/);
  assert.match(ADMIN_SERVER, /admin_list_administrative_audit/);
  assert.match(ADMIN_SERVER, /admin_list_organization_notes/);
  assert.doesNotMatch(body, /"list_organization_members"/);
  assert.doesNotMatch(body, /"list_administrative_audit"/);
});

test("les huit Server Actions du cycle de vie existent et revérifient is_platform_admin_self (double barrière)", () => {
  for (const action of [
    "suspendOrganizationAction", "reactivateOrganizationAction", "archiveOrganizationAction",
    "restoreOrganizationAction", "disableMemberAction", "reactivateMemberAction",
    "transferOwnershipAction", "addOrganizationNoteAction",
  ]) {
    assert.match(LIFECYCLE_ACTIONS, new RegExp(`export async function ${action}\\(`));
  }
  assert.match(LIFECYCLE_ACTIONS, /"use server"/);
  assert.match(LIFECYCLE_ACTIONS, /is_platform_admin_self/);
  // error.message ne fuite jamais (même discipline que commercial-ops-actions.ts).
  assert.doesNotMatch(LIFECYCLE_ACTIONS, /message: error\.message/);
});

test("OrganizationDetailView reçoit `lifecycle` et rend les sections cycle de vie / membres / notes / historique", () => {
  assert.match(ADMIN_VIEWS, /lifecycle: OrganizationLifecycle \| null;/);
  assert.match(ADMIN_VIEWS, /t\.lifecycleSectionTitle/);
  assert.match(ADMIN_VIEWS, /t\.membersSectionTitle/);
  assert.match(ADMIN_VIEWS, /t\.notesSectionTitle/);
  assert.match(ADMIN_VIEWS, /t\.lifecycleHistoryTitle/);
  assert.match(ADMIN_VIEWS, /lifecycle\.members\.map/);
  assert.match(ADMIN_VIEWS, /lifecycle\.notes\.map/);
  assert.match(ADMIN_VIEWS, /lifecycle\.history\.map/);
});

test("l'archivage exige la saisie exacte du nom, revalidée côté serveur (jamais la seule case à cocher)", () => {
  assert.match(ADMIN_VIEWS, /archiveOrganizationAction\(\s*detail\.organizationId,\s*archiveConfirmName,\s*orgActionReason,?\s*\)/);
  assert.match(MIGRATION_CLEAN, /trim\(p_confirm_name\) <> coalesce\(profile_name, ''\)/);
});

test("la page fiche Organization récupère le cycle de vie en Promise.all, jamais bloquant pour le reste de la fiche", () => {
  assert.match(ORG_PAGE, /Promise\.all\(\[\s*getOrganizationDetail\(organizationId\),\s*getOrganizationLifecycle\(organizationId\),\s*\]\)/);
  assert.match(ORG_PAGE, /lifecycle=\{lifecycleResult\.ok \? lifecycleResult\.data : null\}/);
});

test("les nouvelles classes CSS (bouton compact, notes internes) sont bien définies", () => {
  assert.match(GLOBALS_CSS, /\.admin-action-button--small/);
  assert.match(GLOBALS_CSS, /\.admin-notes-list/);
});

test("copy.ts fournit les mêmes clés REVENUE-01H en français et en anglais (aucun écran à moitié traduit)", () => {
  const NEW_KEYS = [
    "lifecycleSectionTitle", "lifecycleActionSuspend", "lifecycleActionReactivate",
    "lifecycleActionArchive", "lifecycleActionRestore", "lifecycleArchiveNameLabel",
    "membersSectionTitle", "actionDisableMember", "actionReactivateMember", "actionTransferOwnership",
    "notesSectionTitle", "actionAddNote", "formNoteLabel", "lifecycleHistoryTitle",
  ];
  const [frSection] = ADMIN_COPY.split("const en: AdminCopy = {");
  const enSection = ADMIN_COPY.slice(ADMIN_COPY.indexOf("const en: AdminCopy = {"));
  for (const key of NEW_KEYS) {
    assert.ok(frSection.includes(`${key}:`), `clé FR manquante : ${key}`);
    assert.ok(enSection.includes(`${key}:`), `clé EN manquante : ${key}`);
  }
});

// ---------------------------------------------------------------------------
// 13. pgTAP — réellement exécuté (PostgreSQL 16 local + pgtap réel)
// ---------------------------------------------------------------------------

test("le fichier pgTAP 01H déclare exactement autant d'assertions que son plan()", () => {
  const clean = sansCommentaires(PGTAP);
  const planMatch = clean.match(/select plan\((\d+)\);/);
  assert.ok(planMatch, "select plan(N) introuvable");
  const declared = Number(planMatch![1]);
  const assertions = (clean.match(/^select (is|ok|throws_ok)\(/gm) ?? []).length;
  assert.equal(assertions, declared);
});

test("le fichier pgTAP 01H s'exécute dans une transaction annulée (rollback)", () => {
  assert.match(PGTAP, /^begin;/);
  assert.match(PGTAP, /rollback;\s*$/);
});

test("le fichier pgTAP 01H couvre bien le changement has_capability (le point le plus à risque)", () => {
  assert.match(PGTAP, /private\.has_capability\('08100000-0000-4000-8000-00000000000a', 'organization\.view'\)/);
  assert.match(sansCommentaires(PGTAP), /false,\s*\n\s*'un membre actif d''une Organization suspendue perd sa capacité/);
});
