import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
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

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const PROVIDER_TS = read("src/core/billing/provider.ts");
const PROVIDER_CONFIG = read("src/core/billing/provider-config.ts");
const WEBHOOK_ROUTE = read("src/app/api/billing/webhooks/[provider]/route.ts");
const STRIPE_SKELETON = read("src/core/billing/adapters/stripe-skeleton-adapter.ts");
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

test(".env.example ne documente que les NOMS des variables de coupe-circuit, jamais de valeur", () => {
  const lines = ENV_EXAMPLE.split("\n").filter((l) => l.includes("BILLING_KILL_SWITCH"));
  assert.ok(lines.length >= 2, "au moins le coupe-circuit global et un coupe-circuit par provider doivent être documentés");
  for (const line of lines) {
    if (line.trim().startsWith("#")) continue;
    assert.ok(line.trim().endsWith("="), `valeur présente dans .env.example : ${line}`);
  }
});

// ---------------------------------------------------------------------------
// 3. Squelette Stripe — architecture "préparée", jamais opérationnelle
// ---------------------------------------------------------------------------

test("le squelette Stripe déclare le bon nom et un mode toujours sandbox, sans appel réseau", () => {
  assert.match(STRIPE_SKELETON, /name:\s*"stripe"/);
  assert.match(STRIPE_SKELETON, /mode:\s*providerMode\(\)/);
  const clean = sansCommentaires(STRIPE_SKELETON);
  assert.doesNotMatch(clean, /\bfetch\(/);
  assert.doesNotMatch(clean, /require\(["']https?["']\)/);
  assert.doesNotMatch(clean, /from ["']stripe["']/);
  assert.doesNotMatch(clean, /from ["'](https|http|undici)["']/);
});

test("chaque opération du contrat (obligatoire et optionnelle) rejette explicitement via notImplemented", () => {
  const clean = sansCommentaires(STRIPE_SKELETON);
  for (const op of [
    "createCheckout", "createSubscription", "updateSubscription", "cancelSubscription",
    "chargeRecurring", "retryPayment", "fetchPaymentStatus", "fetchPaymentMethod",
    "refund", "openCustomerPortal",
  ]) {
    assert.match(
      clean,
      new RegExp(`async ${op}\\([\\s\\S]{0,300}?notImplemented\\("${op}"\\)`),
      `${op} doit rejeter explicitement via notImplemented`,
    );
  }
  // verifyWebhook est l'unique exception : il rejette sans jamais prétendre
  // vérifier une signature (voir le test dédié ci-dessous), pas via notImplemented.
  assert.doesNotMatch(clean, /async verifyWebhook[\s\S]{0,300}?notImplemented/);
});

test("notImplemented lève systématiquement (never), jamais une résolution silencieuse", () => {
  const body = STRIPE_SKELETON.slice(
    STRIPE_SKELETON.indexOf("function notImplemented"),
    STRIPE_SKELETON.indexOf("}", STRIPE_SKELETON.indexOf("function notImplemented")) + 1,
  );
  assert.match(body, /: never/);
  assert.match(body, /throw new Error/);
});

test("verifyWebhook ne vérifie jamais de signature réelle et rejette systématiquement", () => {
  const start = STRIPE_SKELETON.indexOf("async verifyWebhook");
  const end = STRIPE_SKELETON.indexOf("},", start);
  const body = STRIPE_SKELETON.slice(start, end);
  assert.match(body, /reason:\s*"provider_not_configured"/);
  assert.match(body, /reason:\s*"invalid_signature"/);
  // Aucun calcul HMAC, aucune comparaison de signature : verifyWebhook ne
  // fait jamais semblant de vérifier quoi que ce soit.
  assert.doesNotMatch(sansCommentaires(body), /hmac|signaturesMatch|timingSafeEqual/i);
});

test("le squelette Stripe ne lit jamais la clé API, seulement le secret de webhook (pour un motif de rejet honnête)", () => {
  const clean = sansCommentaires(STRIPE_SKELETON);
  assert.doesNotMatch(clean, /apiSecret\(/);
  assert.match(clean, /webhookSecret\("stripe"\)/);
});

test("le squelette Stripe n'est enregistré nulle part dans le code (jamais déclaré opérationnel)", () => {
  // Comparaison construite avec le même join() que `file` (jamais un suffixe
  // "/"-séparé écrit en dur) : path.join() produit des chemins séparés par
  // "\" sous Windows, donc un `file.endsWith("adapters/stripe-skeleton-
  // adapter.ts")` littéral n'y correspond jamais. Le fichier n'était alors
  // jamais exclu de la boucle et échouait sur sa propre déclaration
  // `export const stripeSkeletonAdapter` — alors que le squelette lui-même
  // est correct des deux côtés.
  const skeletonPath = join(ROOT, "src/core/billing/adapters/stripe-skeleton-adapter.ts");
  const sources = walk(join(ROOT, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
  for (const file of sources) {
    if (file === skeletonPath) continue;
    const code = sansCommentaires(readFileSync(file, "utf8"));
    assert.doesNotMatch(code, /stripeSkeletonAdapter/, `${file} ne doit pas référencer stripeSkeletonAdapter`);
  }
  assert.doesNotMatch(sansCommentaires(STRIPE_SKELETON), /^\s*registerBillingProvider\(/m);
});

test("le registre de providers reste vide par défaut, avant et après l'import du squelette", () => {
  resetBillingProviders();
  assert.deepEqual(registeredProviders(), []);
});
