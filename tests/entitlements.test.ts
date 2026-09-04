// =============================================================================
// Node tests — ALIGN-01 Plans, Quotas & Entitlements (model layer)
// Uses Node built-in test runner (no vitest, no @/ alias)
// =============================================================================

import assert from "node:assert/strict";
import test from "node:test";
import {
  PLAN_SLUGS,
  PLAN_QUOTA_TABLE,
  PLAN_FEATURES,
  isPlanSlug,
  isPlanFeature,
  minimumPlanForFeature,
  PLAN_LABELS,
} from "../src/core/entitlements/model.ts";

// ---------------------------------------------------------------------------
// Plan slug validation
// ---------------------------------------------------------------------------

test("isPlanSlug accepte tous les slugs valides", () => {
  for (const slug of PLAN_SLUGS) {
    assert.equal(isPlanSlug(slug), true, `slug valide attendu: ${slug}`);
  }
});

test("isPlanSlug rejette des valeurs inconnues", () => {
  assert.equal(isPlanSlug("free"), false);
  assert.equal(isPlanSlug(""), false);
  assert.equal(isPlanSlug("premium"), false);
});

// ---------------------------------------------------------------------------
// Feature validation
// ---------------------------------------------------------------------------

test("isPlanFeature accepte toutes les features valides", () => {
  for (const f of PLAN_FEATURES) {
    assert.equal(isPlanFeature(f), true, `feature valide attendue: ${f}`);
  }
});

test("isPlanFeature rejette des valeurs inconnues", () => {
  assert.equal(isPlanFeature("billing"), false);
  assert.equal(isPlanFeature(""), false);
  assert.equal(isPlanFeature("stripe"), false);
});

// ---------------------------------------------------------------------------
// Quota table — decouverte
// ---------------------------------------------------------------------------

test("decouverte — quotas corrects", () => {
  const q = PLAN_QUOTA_TABLE.decouverte;
  assert.equal(q.maxProperties, 1);
  assert.equal(q.maxActiveUnits, 3);
  assert.equal(q.maxCollaborators, 0);
  assert.equal(q.maxOrganizations, 1);
});

test("essentiel — quotas corrects", () => {
  const q = PLAN_QUOTA_TABLE.essentiel;
  assert.equal(q.maxProperties, 3);
  assert.equal(q.maxActiveUnits, 10);
  assert.equal(q.maxCollaborators, 1);
  assert.equal(q.maxOrganizations, 1);
});

test("avance — quotas corrects", () => {
  const q = PLAN_QUOTA_TABLE.avance;
  assert.equal(q.maxProperties, 10);
  assert.equal(q.maxActiveUnits, 30);
  assert.equal(q.maxCollaborators, 3);
  assert.equal(q.maxOrganizations, 2);
});

test("patrimoine — quotas corrects", () => {
  const q = PLAN_QUOTA_TABLE.patrimoine;
  assert.equal(q.maxProperties, 30);
  assert.equal(q.maxActiveUnits, 100);
  assert.equal(q.maxCollaborators, 10);
  assert.equal(q.maxOrganizations, 5);
});

test("quotas croissants d'un plan à l'autre", () => {
  const order = [
    PLAN_QUOTA_TABLE.decouverte,
    PLAN_QUOTA_TABLE.essentiel,
    PLAN_QUOTA_TABLE.avance,
    PLAN_QUOTA_TABLE.patrimoine,
  ];
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i].maxProperties! > order[i - 1].maxProperties!,
      `maxProperties croissant à l'index ${i}`);
    assert.ok(order[i].maxActiveUnits! > order[i - 1].maxActiveUnits!,
      `maxActiveUnits croissant à l'index ${i}`);
    assert.ok(order[i].maxCollaborators! >= order[i - 1].maxCollaborators!,
      `maxCollaborators non décroissant à l'index ${i}`);
    assert.ok(order[i].maxOrganizations! >= order[i - 1].maxOrganizations!,
      `maxOrganizations non décroissant à l'index ${i}`);
  }
});

// ---------------------------------------------------------------------------
// minimumPlanForFeature
// ---------------------------------------------------------------------------

test("fonctionnalités cœur disponibles depuis decouverte", () => {
  assert.equal(minimumPlanForFeature("properties"), "decouverte");
  assert.equal(minimumPlanForFeature("receipts"), "decouverte");
  assert.equal(minimumPlanForFeature("tenant_portal"), "decouverte");
  assert.equal(minimumPlanForFeature("payments_manual"), "decouverte");
});

test("contracts et collaborators nécessitent essentiel", () => {
  assert.equal(minimumPlanForFeature("contracts"), "essentiel");
  assert.equal(minimumPlanForFeature("contract_templates_system"), "essentiel");
  assert.equal(minimumPlanForFeature("collaborators"), "essentiel");
});

test("modèles personnalisés et audit avancé nécessitent avance", () => {
  assert.equal(minimumPlanForFeature("contract_templates_custom"), "avance");
  assert.equal(minimumPlanForFeature("audit_advanced"), "avance");
  assert.equal(minimumPlanForFeature("automation_advanced"), "avance");
  assert.equal(minimumPlanForFeature("multi_organization"), "avance");
});

test("reporting consolidé nécessite patrimoine", () => {
  assert.equal(minimumPlanForFeature("reporting_consolidated"), "patrimoine");
});

test("api_access, webhooks, sso, white_label nécessitent sur_mesure", () => {
  assert.equal(minimumPlanForFeature("api_access"), "sur_mesure");
  assert.equal(minimumPlanForFeature("webhooks"), "sur_mesure");
  assert.equal(minimumPlanForFeature("sso"), "sur_mesure");
  assert.equal(minimumPlanForFeature("white_label"), "sur_mesure");
});

// ---------------------------------------------------------------------------
// Plan labels — exhaustivité
// ---------------------------------------------------------------------------

test("tous les plans ont un libellé FR et EN", () => {
  for (const slug of PLAN_SLUGS) {
    assert.ok(PLAN_LABELS[slug].fr.length > 0, `FR label manquant: ${slug}`);
    assert.ok(PLAN_LABELS[slug].en.length > 0, `EN label manquant: ${slug}`);
  }
});

// ---------------------------------------------------------------------------
// Migration SQL — structure de base
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260902200000_align_01_plans_entitlements.sql",
    import.meta.url,
  ),
  "utf8",
);

test("migration crée organization_plans avec RLS", () => {
  assert.match(migration, /create table public\.organization_plans/);
  assert.match(migration, /alter table public\.organization_plans enable row level security/);
});

test("migration crée plan_features et les seed", () => {
  assert.match(migration, /create table public\.plan_features/);
  // contracts n'est PAS dans decouverte
  assert.doesNotMatch(migration, /\('decouverte', 'contracts'\)/);
  // contracts est dans essentiel
  assert.match(migration, /\('essentiel', 'contracts'\)/);
});

test("migration enforce property quota via trigger", () => {
  assert.match(migration, /enforce_property_quota_insert/);
  assert.match(migration, /PLAN_PROPERTY_LIMIT_REACHED/);
});

test("migration enforce unit quota via trigger", () => {
  assert.match(migration, /enforce_active_unit_quota_insert/);
  assert.match(migration, /PLAN_ACTIVE_UNIT_LIMIT_REACHED/);
});

test("migration enforce collaborator quota dans create_membership_invitation", () => {
  assert.match(migration, /assert_collaborator_quota/);
  assert.match(migration, /PLAN_COLLABORATOR_LIMIT_REACHED/);
});

test("migration documente le backfill comme désactivé (gate correctif)", () => {
  // Filtrer les lignes commentées pour ne tester que le SQL actif
  const activeSQL = migration
    .split('\n')
    .filter(l => !l.trimStart().startsWith('--'))
    .join('\n');
  // Aucun INSERT actif vers organization_plans via SELECT id (backfill neutralisé)
  assert.doesNotMatch(
    activeSQL,
    /insert into public\.organization_plans[\s\S]{0,300}select id,\s*'decouverte'/,
  );
  // La désactivation doit être documentée dans un commentaire explicite
  assert.match(migration, /désactivé/i);
});

test("migration n'active aucun provider billing ou paiement", () => {
  // Absence de références à des providers de paiement réels
  assert.doesNotMatch(migration, /stripe|campay|flutterwave|elyonpay/i);
  // Absence de tables de facturation réelles (DDL, pas commentaires)
  assert.doesNotMatch(migration, /create table[\s\S]{0,60}(subscription|invoice|checkout)/i);
  // Absence de fonctions billing (hors commentaires)
  assert.doesNotMatch(migration, /create[\s\S]{0,30}function[\s\S]{0,60}billing/i);
  // Absence de webhooks billing
  assert.doesNotMatch(migration, /webhook[\s\S]{0,60}(stripe|payment|billing)/i);
});

test("assign_organization_plan est dans le schéma private (non accessible client)", () => {
  assert.match(migration, /create or replace function private\.assign_organization_plan/);
  // pas de grant execute au public/authenticated pour cette fonction
  assert.doesNotMatch(migration, /grant execute on function private\.assign_organization_plan/);
});
