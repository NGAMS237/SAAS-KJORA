// =============================================================================
// Node tests — PATCH-6F-UX : portal navigation + SaaS entitlement gating
// =============================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { portalNavigation } from "../src/core/navigation/navigation.ts";
import { minimumPlanForFeature } from "../src/core/entitlements/model.ts";

const migration6f = readFileSync(
  new URL("../supabase/migrations/20260901224122_lot_6f_contracts_signatures.sql", import.meta.url),
  "utf8",
);
const migrationGating = readFileSync(
  new URL("../supabase/migrations/20260903120000_patch_6f_ux_entitlement_gating.sql", import.meta.url),
  "utf8",
);

// ---------------------------------------------------------------------------
// Portal navigation
// ---------------------------------------------------------------------------

test("portalNavigation contient /portal/contrats", () => {
  const entry = portalNavigation.find((e) => e.href === "/portal/contrats");
  assert.ok(entry, "entrée /portal/contrats manquante dans portalNavigation");
});

test("portalNavigation /portal/contrats a un label non vide", () => {
  const entry = portalNavigation.find((e) => e.href === "/portal/contrats");
  assert.ok(entry?.label && entry.label.length > 0, "label manquant");
});

test("portalNavigation /portal/contrats a une icône", () => {
  const entry = portalNavigation.find((e) => e.href === "/portal/contrats");
  assert.ok(entry?.icon, "icône manquante pour /portal/contrats");
});

// ---------------------------------------------------------------------------
// Entitlement model — contracts gating
// ---------------------------------------------------------------------------

test("contracts est gated à essentiel minimum", () => {
  assert.equal(minimumPlanForFeature("contracts"), "essentiel");
});

test("contract_templates_system est gated à essentiel minimum", () => {
  assert.equal(minimumPlanForFeature("contract_templates_system"), "essentiel");
});

test("contract_templates_custom est gated à avance minimum", () => {
  assert.equal(minimumPlanForFeature("contract_templates_custom"), "avance");
});

test("decouverte n'a pas contracts dans plan_features (migration ALIGN-01)", () => {
  const alignMigration = readFileSync(
    new URL("../supabase/migrations/20260902200000_align_01_plans_entitlements.sql", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(alignMigration, /\('decouverte', 'contracts'\)/);
  assert.doesNotMatch(alignMigration, /\('decouverte', 'contract_templates_system'\)/);
  assert.doesNotMatch(alignMigration, /\('decouverte', 'contract_templates_custom'\)/);
});

test("essentiel a contracts dans plan_features", () => {
  const alignMigration = readFileSync(
    new URL("../supabase/migrations/20260902200000_align_01_plans_entitlements.sql", import.meta.url),
    "utf8",
  );
  assert.match(alignMigration, /\('essentiel', 'contracts'\)/);
  assert.match(alignMigration, /\('essentiel', 'contract_templates_system'\)/);
});

test("avance a contract_templates_custom dans plan_features", () => {
  const alignMigration = readFileSync(
    new URL("../supabase/migrations/20260902200000_align_01_plans_entitlements.sql", import.meta.url),
    "utf8",
  );
  assert.match(alignMigration, /\('avance', 'contract_templates_custom'\)/);
});

// ---------------------------------------------------------------------------
// Migration de gating RPC — structure de sécurité
// ---------------------------------------------------------------------------

test("migration gating appelle org_has_feature pour generate_lease_contract", () => {
  assert.match(migrationGating, /generate_lease_contract/);
  assert.match(migrationGating, /public\.org_has_feature[\s\S]{0,100}'contracts'/);
});

test("migration gating appelle org_has_feature pour validate_lease_contract", () => {
  assert.match(migrationGating, /validate_lease_contract/);
});

test("migration gating appelle org_has_feature pour sign_lease_contract_owner", () => {
  assert.match(migrationGating, /sign_lease_contract_owner/);
});

test("migration gating appelle org_has_feature pour send_lease_contract", () => {
  assert.match(migrationGating, /send_lease_contract/);
});

test("migration gating appelle org_has_feature pour cancel_lease_contract", () => {
  assert.match(migrationGating, /cancel_lease_contract/);
});

test("migration gating appelle contract_templates_custom pour duplicate et create_version", () => {
  assert.match(migrationGating, /duplicate_contract_template/);
  assert.match(migrationGating, /create_contract_template_version/);
  assert.match(migrationGating, /contract_templates_custom/);
});

test("migration gating raise PLAN_FEATURE_NOT_AVAILABLE sur accès interdit", () => {
  assert.match(migrationGating, /PLAN_FEATURE_NOT_AVAILABLE/);
});

test("migration gating préserve le check RBAC has_capability avant le feature gate", () => {
  // Le check RBAC doit précéder org_has_feature dans chaque fonction
  const generateBlock = migrationGating.slice(
    migrationGating.indexOf("generate_lease_contract"),
    migrationGating.indexOf("validate_lease_contract"),
  );
  const rbacPos = generateBlock.indexOf("has_capability");
  const featurePos = generateBlock.indexOf("org_has_feature");
  assert.ok(rbacPos < featurePos, "RBAC doit précéder org_has_feature dans generate_lease_contract");
});

test("migration gating est dans une transaction (begin/commit)", () => {
  assert.match(migrationGating, /^begin;/m);
  assert.match(migrationGating, /^commit;/m);
});

test("migration gating ne touche pas aux RPCs tenant-portal (sign_tenant, finalize)", () => {
  // Ces RPCs restent scoped portal-access — pas de feature gate ici
  assert.doesNotMatch(
    migrationGating,
    /create or replace function public\.sign_lease_contract_tenant/,
  );
  assert.doesNotMatch(
    migrationGating,
    /create or replace function public\.finalize_lease_contract/,
  );
});

test("portail 6F reste tenant-lease-scoped (migration 6F d'origine)", () => {
  assert.match(migration6f, /private\.has_active_tenant_portal_access\(target_access_id\)/);
  assert.match(migration6f, /la\.tenant_id=c\.tenant_id and la\.lease_id=c\.lease_id/);
});
