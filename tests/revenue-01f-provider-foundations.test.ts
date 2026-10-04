import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// =============================================================================
// REVENUE-LAUNCH-01 — Sous-lot 01F — Fondations fournisseur
// =============================================================================
// Audit préalable (voir session) : ALIGN-04A avait déjà construit un contrat
// d'adaptateur très complet (provider.ts), une matrice de capacités
// (provider-capabilities.ts), un routage pur (provider-routing.ts), une
// configuration serveur avec sandbox obligatoire (provider-config.ts) et une
// route de réception de webhooks entièrement câblée. Manques réellement
// prouvés par audit, comblés ici SANS toucher au reste :
//   • aucune des 10 opérations du contrat ne couvrait le "portail client" ;
//   • aucun coupe-circuit (kill switch) n'existait, à aucun niveau ;
//   • aucun fichier n'incarnait concrètement "l'architecture préparée pour
//     Stripe" que le Canada/diaspora attend (décision verrouillée) — un
//     squelette inerte comble ce manque, sans réexaminer D-143/ALIGN-04A.
// =============================================================================

import {
  PROVIDER_CAPABILITIES,
  PROVIDER_NAMES,
  PROVIDER_OPERATIONS,
  type ProviderOperation,
} from "../src/core/billing/provider-capabilities.ts";
import { registeredProviders, resetBillingProviders } from "../src/core/billing/provider.ts";
// stripe-skeleton-adapter.ts porte `import "server-only"` (le paquet n'est pas
// installé dans ce bac à sable, comme provider-config.ts et billing/server.ts
// — voir billing-providers.test.ts, section SERVER_ONLY) : il est donc
// inspecté en texte source ci-dessous, jamais importé comme module ES,
// exactement comme le reste du code server-only de ce projet dans les tests.

const ROOT = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*--.*$/gm, "");
}

const PROVIDER_TS = read("src/core/billing/provider.ts");
const PROVIDER_CONFIG = read("src/core/billing/provider-config.ts");
const WEBHOOK_ROUTE = read("src/app/api/billing/webhooks/[provider]/route.ts");
const STRIPE_ADAPTER = read("src/core/billing/adapters/stripe-test-adapter.ts");
const ENV_EXAMPLE = read(".env.example");

// ---------------------------------------------------------------------------
// 1. Portail client — onzième opération, honnêtement non déclarée
// ---------------------------------------------------------------------------

test("openCustomerPortal existe dans le contrat comme opération optionnelle", () => {
  assert.match(PROVIDER_TS, /openCustomerPortal\?\(request: CustomerPortalRequest\): Promise<CustomerPortalSession>/);
  assert.ok(PROVIDER_OPERATIONS.includes("openCustomerPortal" as ProviderOperation));
});

test("aucun des 6 providers étudiés ne déclare openCustomerPortal (jamais deviné)", () => {
  for (const name of PROVIDER_NAMES) {
    assert.ok(
      !PROVIDER_CAPABILITIES[name].operations.includes("openCustomerPortal"),
      `${name} ne doit pas déclarer openCustomerPortal sans vérification documentaire`,
    );
  }
});

test("les déclarations de capacités pré-existantes ne sont pas modifiées par ce lot", () => {
  // Non-régression explicite : le statut Stripe (rejeté, D-143) doit rester
  // intact — ce lot ne réexamine jamais cette décision.
  assert.equal(PROVIDER_CAPABILITIES.stripe.status, "rejected");
  assert.equal(PROVIDER_CAPABILITIES.stripe.merchantEligibleCameroon, false);
  assert.equal(PROVIDER_CAPABILITIES.flutterwave.status, "selected");
});

// ---------------------------------------------------------------------------
// 2. Coupe-circuit (kill switch)
// ---------------------------------------------------------------------------

test("un coupe-circuit global (BILLING_KILL_SWITCH_ALL) existe et coupe tous les providers", () => {
  const body = sansCommentaires(PROVIDER_CONFIG);
  assert.match(body, /BILLING_KILL_SWITCH_ALL/);
  assert.match(body, /export function isProviderKillSwitched/);
});

test("un coupe-circuit par provider existe, dérivé du nom en majuscules", () => {
  assert.match(sansCommentaires(PROVIDER_CONFIG), /BILLING_KILL_SWITCH_\$\{name\.toUpperCase\(\)\}/);
});

test("configuredProviders() exclut désormais tout provider coupé, en plus de non configuré", () => {
  const start = PROVIDER_CONFIG.indexOf("export function configuredProviders");
  const body = PROVIDER_CONFIG.slice(start, PROVIDER_CONFIG.indexOf("\n}", start));
  assert.match(body, /isProviderConfigured\(name\)/);
  assert.match(body, /!isProviderKillSwitched\(name\)/);
});

test("le coupe-circuit reste inactif par défaut : aucune variable positionnée ne change le comportement existant", () => {
  // isKillSwitchOn compare strictement à "1" : une variable absente (undefined)
  // ou toute autre valeur laisse le provider intact.
  assert.match(sansCommentaires(PROVIDER_CONFIG), /\.trim\(\) === "1"/);
});

test("la route de webhook traite un provider coupé exactement comme un provider non configuré (503, indiscernable)", () => {
  const idxConfigured = WEBHOOK_ROUTE.indexOf("if (!isProviderConfigured(provider))");
  const idxKilled = WEBHOOK_ROUTE.indexOf("if (isProviderKillSwitched(provider))");
  assert.notEqual(idxConfigured, -1);
  assert.notEqual(idxKilled, -1);
  assert.ok(idxConfigured < idxKilled, "la vérification non-configuré doit précéder la vérification coupe-circuit");
  const killedBlock = WEBHOOK_ROUTE.slice(idxKilled, idxKilled + 500);
  assert.match(killedBlock, /status:\s*503/);
});

test(".env.example ferme Stripe au premier déploiement et ne contient aucune valeur sensible de coupe-circuit", () => {
  const lines = ENV_EXAMPLE.split("\n").filter((l) => l.includes("BILLING_KILL_SWITCH"));
  assert.ok(lines.length >= 2, "au moins le coupe-circuit global et un coupe-circuit par provider doivent être documentés");
  for (const line of lines) {
    if (line.trim().startsWith("#")) continue;
    const [name, value = ""] = line.trim().split("=", 2);
    if (name === "BILLING_KILL_SWITCH_STRIPE") {
      assert.equal(value, "1", "Stripe Test doit rester explicitement coupé sur Hostinger");
    } else {
      assert.equal(value, "", `valeur inattendue dans .env.example : ${line}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Stripe Test — activation explicite, jamais Live
// ---------------------------------------------------------------------------

test("l'adaptateur Stripe reste sandbox, refuse les clés live et exige CAD", () => {
  assert.match(STRIPE_ADAPTER, /mode:\s*"sandbox"/);
  assert.match(STRIPE_ADAPTER, /secret\.startsWith\("sk_test_"\)/);
  assert.match(STRIPE_ADAPTER, /request\.currency !== "CAD"/);
  assert.doesNotMatch(sansCommentaires(STRIPE_ADAPTER), /sk_live_[A-Za-z0-9]/);
});

test("Checkout, Portal et signature utilisent le SDK officiel côté serveur", () => {
  assert.match(STRIPE_ADAPTER, /from "stripe"/);
  assert.match(STRIPE_ADAPTER, /checkout\.sessions\.create/);
  assert.match(STRIPE_ADAPTER, /billingPortal\.sessions\.create/);
  assert.match(STRIPE_ADAPTER, /webhooks\.constructEvent/);
});

test("le registre de providers reste vide par défaut tant que le bootstrap n'est pas appelé", () => {
  resetBillingProviders();
  assert.deepEqual(registeredProviders(), []);
});
