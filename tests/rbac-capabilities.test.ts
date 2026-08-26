import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CAPABILITIES, INTERNAL_ROLES, isCapability, isInternalRole } from "../src/core/authorization/capabilities.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20260826093143_lot_5c_membership_rbac.sql", import.meta.url),
  "utf8",
);
const ownerHardening = readFileSync(
  new URL("../supabase/migrations/20260826143000_lot_5c_owner_hardening.sql", import.meta.url),
  "utf8",
);
const teamUi = readFileSync(
  new URL("../src/core/team/team-management.tsx", import.meta.url),
  "utf8",
);

function grants(role: string, capability: string) {
  return migration.includes(`('${role}', '${capability}')`);
}

test("le RBAC contient exactement les six rôles internes confirmés", () => {
  assert.deepEqual(INTERNAL_ROLES, ["organization_owner", "manager", "collector", "caretaker", "accountant", "viewer"]);
  assert.equal(isInternalRole("tenant"), false);
});

test("chaque capacité exposée est un identifiant versionné", () => {
  assert.ok(CAPABILITIES.every(isCapability));
  assert.equal(isCapability("admin.everything"), false);
});

test("Owner seul gère membres, paramètres sensibles et audit", () => {
  for (const role of INTERNAL_ROLES) {
    assert.equal(grants(role, "member.manage"), role === "organization_owner");
    assert.equal(grants(role, "organization.profile.manage"), role === "organization_owner");
    assert.equal(grants(role, "audit.view"), role === "organization_owner");
  }
});

test("Owner, gestionnaire et encaisseur peuvent enregistrer un paiement", () => {
  for (const role of INTERNAL_ROLES) {
    assert.equal(grants(role, "payment.record"), ["organization_owner", "manager", "collector"].includes(role));
  }
});

test("gardien et consultation n’obtiennent aucune capacité financière implicite", () => {
  for (const role of ["caretaker", "viewer"]) {
    assert.equal(grants(role, "payment.view"), false);
    assert.equal(grants(role, "payment.record"), false);
    assert.equal(grants(role, "receipt.share"), false);
  }
});

test("le portail locataire reste absent des rôles Membership", () => {
  assert.equal(migration.includes("tenant_portal_access"), false);
  assert.ok(grants("organization_owner", "tenant_portal.manage"));
  assert.ok(grants("manager", "tenant_portal.manage"));
});

test("la migration active RLS et ne stocke que le hash des invitations", () => {
  assert.match(migration, /alter table public\.membership_invitations enable row level security/i);
  assert.match(migration, /alter table public\.administrative_audit_log enable row level security/i);
  assert.match(migration, /token_hash text not null unique/i);
  assert.doesNotMatch(migration, /service_role/i);
});

test("les opérations génériques ne peuvent ni créer ni retirer un Owner", () => {
  assert.match(ownerHardening, /check \(role <> 'organization_owner'\)/i);
  assert.match(ownerHardening, /owner_transfer_required/i);
  assert.match(ownerHardening, /self_revocation_forbidden/i);
  assert.match(teamUi, /ASSIGNABLE_ROLES = INTERNAL_ROLES\.filter/);
});
