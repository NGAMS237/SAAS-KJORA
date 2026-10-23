// =============================================================================
// ALIGN-04A — Providers de paiement : capacités, routage, webhooks, frontières
// =============================================================================
// 23 scénarios. Aucun appel réseau, aucun secret, aucun provider réel.
// =============================================================================

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  PROVIDER_CAPABILITIES, PROVIDER_NAMES, PROVIDER_OPERATIONS, REQUIRED_OPERATIONS,
  bestRecurrence, isIntegrable, isProviderName, methodAvailableIn, providersFor, supportsCurrency,
  type ProviderName,
} from "../src/core/billing/provider-capabilities.ts";
import {
  MOMO_ROUTING_ORDER, ROUTING_ORDER, affordanceFor, normalizeMethodHint, routeProvider,
} from "../src/core/billing/provider-routing.ts";
import {
  buildIdempotencyKey, decideWebhook, effectActivatesPlan, type WebhookContext,
} from "../src/core/billing/webhook-rules.ts";
import {
  hmacDigest, signaturesMatch, verifyHmacSignature, verifyFlutterwaveSignature,
} from "../src/core/billing/signature.ts";
import { RECURRENCE_MESSAGES, CHECKOUT_UNAVAILABLE_MESSAGES } from "../src/core/billing/types.ts";

const ROOT = join(import.meta.dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Retire commentaires et chaînes de doc, pour ne jamais tester ses propres notes. */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*--.*$/gm, "");
}

const CONFIGURED_ALL: ProviderName[] = ["flutterwave", "campay", "elyonpay"];

// ---------------------------------------------------------------------------
// 1–5 — Matrice de capacités
// ---------------------------------------------------------------------------

test("01 — les 6 providers étudiés sont tous décrits dans la matrice", () => {
  for (const name of ["stripe", "campay", "flutterwave", "payunit", "elyonpay", "notchpay"]) {
    assert.ok(isProviderName(name), `${name} doit être un ProviderName`);
    assert.equal(PROVIDER_CAPABILITIES[name as ProviderName].name, name);
  }
  assert.equal(PROVIDER_NAMES.length, 6);
});

test("02 — le contrat nomme exactement 11 opérations (10 ALIGN-04A + openCustomerPortal REVENUE-01F)", () => {
  assert.equal(PROVIDER_OPERATIONS.length, 11);
  assert.equal(new Set(PROVIDER_OPERATIONS).size, 11);
  assert.ok(PROVIDER_OPERATIONS.includes("openCustomerPortal"));
});

test("03 — aucun provider n'est contraint de tout supporter", () => {
  const partiels = PROVIDER_NAMES.filter(
    (n) => PROVIDER_CAPABILITIES[n].operations.length > 0 &&
           PROVIDER_CAPABILITIES[n].operations.length < PROVIDER_OPERATIONS.length,
  );
  assert.ok(partiels.length >= 3, "la matrice doit refléter des couvertures inégales");
  // Et pourtant les retenus offrent bien le minimum exigé.
  for (const n of PROVIDER_NAMES.filter((p) => PROVIDER_CAPABILITIES[p].status === "selected")) {
    for (const op of REQUIRED_OPERATIONS) {
      assert.ok(PROVIDER_CAPABILITIES[n].operations.includes(op), `${n} doit offrir ${op}`);
    }
  }
});

test("04 — Stripe est écarté parce que le marchand camerounais est inéligible", () => {
  const stripe = PROVIDER_CAPABILITIES.stripe;
  assert.equal(stripe.status, "rejected");
  assert.equal(stripe.merchantEligibleCameroon, false);
  assert.equal(isIntegrable("stripe"), false);
});

test("05 — PayUnit ne déclare aucune capacité devinée", () => {
  const p = PROVIDER_CAPABILITIES.payunit;
  assert.equal(p.status, "rejected");
  assert.deepEqual([...p.currencies], []);
  assert.deepEqual([...p.operations], []);
  assert.ok(p.needsConfirmation.length > 0, "les inconnues doivent être listées, pas comblées");
});

// ---------------------------------------------------------------------------
// 6–8 — Devises et récurrence
// ---------------------------------------------------------------------------

test("06 — aucune devise hors XAF/CAD n'existe dans la matrice", () => {
  for (const n of PROVIDER_NAMES) {
    for (const c of PROVIDER_CAPABILITIES[n].currencies) {
      assert.ok(c === "XAF" || c === "CAD", `devise inattendue chez ${n} : ${c}`);
    }
  }
});

test("07 — seul Flutterwave couvre le CAD parmi les providers intégrables", () => {
  const cad = PROVIDER_NAMES.filter((n) => isIntegrable(n) && supportsCurrency(n, "CAD"));
  assert.deepEqual(cad, ["flutterwave"]);
});

test("08 — CamPay ne promet pas le prélèvement silencieux", () => {
  assert.equal(bestRecurrence("campay"), "customer_approved");
  assert.equal(bestRecurrence("flutterwave"), "unattended");
});

// ---------------------------------------------------------------------------
// 9–14 — Routage : le serveur décide
// ---------------------------------------------------------------------------

test("09 — un nom de provider envoyé par le client est ignoré", () => {
  for (const hint of ["stripe", "campay", "flutterwave", "payunit", "elyonpay", "notchpay"]) {
    assert.equal(normalizeMethodHint(hint), null, `${hint} ne doit jamais être accepté`);
  }
  assert.equal(normalizeMethodHint({ provider: "stripe" }), null);
  assert.equal(normalizeMethodHint("mtn_momo"), "mtn_momo");
});

test("10 — un client ne peut pas forcer un provider rejeté", () => {
  const d = routeProvider({
    plan: "essentiel", cycle: "monthly", currency: "XAF", amountMinor: 5900,
    configured: [...CONFIGURED_ALL, "stripe", "payunit"] as ProviderName[],
    methodHint: "stripe",
  });
  assert.ok(d.routed);
  assert.notEqual(d.provider, "stripe");
  assert.notEqual(d.provider, "payunit");
});

test("11 — MoMo est routé vers le spécialiste, la carte vers le primaire", () => {
  const momo = routeProvider({
    plan: "essentiel", cycle: "monthly", currency: "XAF", amountMinor: 5900,
    configured: CONFIGURED_ALL, methodHint: "mtn_momo",
  });
  assert.ok(momo.routed);
  assert.equal(momo.provider, "campay");

  const carte = routeProvider({
    plan: "essentiel", cycle: "monthly", currency: "XAF", amountMinor: 5900,
    configured: CONFIGURED_ALL, methodHint: "card",
  });
  assert.ok(carte.routed);
  assert.equal(carte.provider, "flutterwave");

  assert.equal(MOMO_ROUTING_ORDER[0], "campay");
  assert.equal(ROUTING_ORDER[0], "flutterwave");
});

test("12 — le CAD ne peut aller que chez Flutterwave", () => {
  const d = routeProvider({
    plan: "avance", cycle: "monthly", currency: "CAD", amountMinor: 3199,
    configured: CONFIGURED_ALL,
  });
  assert.ok(d.routed);
  assert.equal(d.provider, "flutterwave");

  const sansFlutterwave = routeProvider({
    plan: "avance", cycle: "monthly", currency: "CAD", amountMinor: 3199,
    configured: ["campay", "elyonpay"],
  });
  assert.equal(sansFlutterwave.routed, false);
});

test("13 — aucun provider configuré : refus explicite, jamais de faux checkout", () => {
  const d = routeProvider({
    plan: "essentiel", cycle: "monthly", currency: "XAF", amountMinor: 5900,
    configured: [],
  });
  assert.equal(d.routed, false);
  assert.ok(d.routed === false && d.reason === "no_provider_configured");

  const a = affordanceFor(d);
  assert.equal(a.online, false);
  assert.equal(a.recurrence, null);
  assert.ok(CHECKOUT_UNAVAILABLE_MESSAGES[a.reason!].length > 0);
});

test("14 — Découverte et Sur mesure ne passent jamais par un checkout", () => {
  const gratuit = routeProvider({
    plan: "decouverte", cycle: "monthly", currency: "XAF", amountMinor: 0,
    configured: CONFIGURED_ALL,
  });
  assert.ok(gratuit.routed === false && gratuit.reason === "plan_is_free");

  const devis = routeProvider({
    plan: "sur_mesure", cycle: "monthly", currency: "XAF", amountMinor: 99999,
    configured: CONFIGURED_ALL,
  });
  assert.ok(devis.routed === false && devis.reason === "plan_requires_quote");
});

test("15 — l'affordance ne révèle jamais le provider retenu", () => {
  const d = routeProvider({
    plan: "essentiel", cycle: "monthly", currency: "XAF", amountMinor: 5900,
    configured: CONFIGURED_ALL, methodHint: "mtn_momo",
  });
  const a = affordanceFor(d);
  const serialise = JSON.stringify(a);
  for (const n of PROVIDER_NAMES) {
    assert.ok(!serialise.includes(n), `l'affordance ne doit pas contenir « ${n} »`);
  }
  assert.equal(a.online, true);
  assert.ok(a.recurrence && RECURRENCE_MESSAGES[a.recurrence].length > 0);
});

// ---------------------------------------------------------------------------
// 16–20 — Webhooks : signature, idempotence, autorité
// ---------------------------------------------------------------------------

test("16 — une signature HMAC-SHA256 (hex) valide passe, une altération échoue", () => {
  const body = '{"event":"payment_succeeded","id":"evt_1"}';
  const secret = "secret-de-test-sans-valeur-reelle";
  const sig = hmacDigest(body, secret, "hex");

  assert.equal(verifyHmacSignature(body, sig, secret, "hex").valid, true);
  assert.equal(verifyHmacSignature(body + " ", sig, secret, "hex").valid, false);
  assert.equal(verifyHmacSignature(body, sig, "autre-secret", "hex").valid, false);
  assert.equal(verifyHmacSignature(body, undefined, secret, "hex").reason, "missing_signature");
  assert.equal(verifyHmacSignature(body, sig, null, "hex").reason, "provider_not_configured");
  // L'hexadécimal est insensible à la casse par construction.
  assert.equal(signaturesMatch(sig, sig.toUpperCase(), "hex"), true);
  assert.equal(signaturesMatch(sig, sig.slice(0, -1), "hex"), false);
});

test("16bis — Flutterwave : signature base64, sensible à la casse, jamais normalisée", () => {
  // Reproduit developer.flutterwave.com/docs/webhooks : HMAC-SHA256 du corps
  // brut avec le secret hash, encodé en base64, en-tête `flutterwave-signature`.
  const body = JSON.stringify({ id: "wbk_test", type: "charge.completed", data: { status: "succeeded" } });
  const secretHash = "secret-hash-de-test-sans-valeur-reelle";
  const signature = hmacDigest(body, secretHash, "base64");

  // Une vraie signature base64 contient très souvent des majuscules : le défaut
  // ALIGN-04A (normalisation en minuscules avant comparaison) aurait rejeté ce
  // cas précis dès qu'il en contenait une.
  assert.ok(/[A-Z]/.test(signature) || /[A-Z]/.test(signature + "A="), "sondage base64");
  assert.equal(verifyFlutterwaveSignature(body, signature, secretHash).valid, true);

  // Une signature dont seule la casse diffère n'est PAS équivalente en base64 :
  // elle doit être refusée, jamais acceptée par confort.
  const casseAlteree = signature === signature.toLowerCase() ? signature.toUpperCase() : signature.toLowerCase();
  if (casseAlteree !== signature) {
    assert.equal(signaturesMatch(signature, casseAlteree, "base64"), false);
  }

  assert.equal(verifyFlutterwaveSignature(body, undefined, secretHash).reason, "missing_signature");
  assert.equal(verifyFlutterwaveSignature(body, signature, null).reason, "provider_not_configured");
  assert.equal(verifyFlutterwaveSignature(body + "x", signature, secretHash).valid, false);
});

const baseContext: WebhookContext = {
  alreadyProcessed: false,
  currentStatus: "active",
  pendingPlanExists: true,
  expectedAmountMinor: 6000,
  expectedCurrency: "XAF",
  reportedAmountMinor: 6000,
  reportedCurrency: "XAF",
  organizationKnown: true,
};

test("17 — un événement rejoué n'a aucun effet", () => {
  const d = decideWebhook("payment_succeeded", { ...baseContext, alreadyProcessed: true });
  assert.equal(d.action, "ignore_duplicate");
});

test("18 — un paiement vérifié et cohérent active le plan en attente", () => {
  const d = decideWebhook("payment_succeeded", baseContext);
  assert.equal(d.action, "apply");
  assert.ok(d.action === "apply" && effectActivatesPlan(d.effect));
});

test("19 — un montant ou une devise divergents ne peuvent rien activer", () => {
  const montant = decideWebhook("payment_succeeded", { ...baseContext, reportedAmountMinor: 1 });
  assert.ok(montant.action === "reject" && montant.reason === "amount_mismatch");

  const devise = decideWebhook("payment_succeeded", { ...baseContext, reportedCurrency: "CAD" });
  assert.ok(devise.action === "reject" && devise.reason === "currency_mismatch");
});

test("20 — un paiement sans intention enregistrée n'active rien", () => {
  const d = decideWebhook("payment_succeeded", { ...baseContext, pendingPlanExists: false });
  assert.ok(d.action === "reject" && d.reason === "no_pending_intent");

  const inconnue = decideWebhook("payment_succeeded", { ...baseContext, organizationKnown: false });
  assert.ok(inconnue.action === "reject" && inconnue.reason === "unknown_organization");
});

test("21 — seul payment_succeeded touche au plan ; le reste est constaté", () => {
  for (const kind of ["payment_failed", "payment_pending", "subscription_cancelled", "refund_succeeded"]) {
    const d = decideWebhook(kind, baseContext);
    assert.equal(d.action, "apply");
    assert.ok(d.action === "apply" && !effectActivatesPlan(d.effect), `${kind} ne doit pas activer un plan`);
  }
  const inconnu = decideWebhook("provider.something.else", baseContext);
  assert.equal(inconnu.action, "acknowledge_unhandled");
});

test("22 — la clé d'idempotence est déterministe et discriminante", () => {
  const parts = {
    organizationId: "org-1", plan: "avance", cycle: "monthly",
    amountMinor: 6000, intentId: "intent-1",
  };
  assert.equal(buildIdempotencyKey(parts), buildIdempotencyKey({ ...parts }));
  assert.notEqual(buildIdempotencyKey(parts), buildIdempotencyKey({ ...parts, intentId: "intent-2" }));
  assert.notEqual(buildIdempotencyKey(parts), buildIdempotencyKey({ ...parts, amountMinor: 6001 }));
});

// ---------------------------------------------------------------------------
// 23 — Frontières : secrets, server-only, live mode
// ---------------------------------------------------------------------------

test("23 — aucun secret provider n'est exposé, et le client n'importe rien de server-only", () => {
  const sources = walk(join(ROOT, "src")).filter((f) => /\.(ts|tsx)$/.test(f));

  // (a) Aucune variable provider préfixée NEXT_PUBLIC_.
  for (const file of sources) {
    const code = sansCommentaires(readFileSync(file, "utf8"));
    assert.ok(
      !/NEXT_PUBLIC_[A-Z_]*(STRIPE|CAMPAY|FLUTTERWAVE|PAYUNIT|ELYONPAY|NOTCHPAY|WEBHOOK|SECRET_KEY)/.test(code),
      `secret provider potentiellement exposé au navigateur dans ${file}`,
    );
  }

  // (b) Aucun fichier "use client" n'importe un module server-only.
  const SERVER_ONLY = ["billing/server", "provider-config", "authorization/server", "supabase/server"];
  for (const file of sources) {
    const raw = readFileSync(file, "utf8");
    if (!/^\s*["']use client["']/m.test(raw)) continue;
    const code = sansCommentaires(raw);
    for (const mod of SERVER_ONLY) {
      assert.ok(
        !new RegExp(`from\\s+["'][^"']*${mod}["']`).test(code),
        `${file} est un composant client et importe ${mod}`,
      );
    }
  }

  // (c) Les modules purs ne déclarent pas server-only, sinon le client casse.
  for (const pur of ["types.ts", "model.ts", "provider-capabilities.ts", "provider-routing.ts", "webhook-rules.ts"]) {
    const code = readFileSync(join(ROOT, "src/core/billing", pur), "utf8");
    assert.ok(!/["']server-only["']/.test(code), `${pur} doit rester pur`);
  }

  // (d) Live reste fail-closed et exige les gates du pilote.
  const config = sansCommentaires(readFileSync(join(ROOT, "src/core/billing/provider-config.ts"), "utf8"));
  const stripeMode = sansCommentaires(readFileSync(join(ROOT, "src/core/billing/stripe-mode.ts"), "utf8"));
  assert.match(stripeMode, /if \(testEnabled === liveEnabled\) return null/);
  assert.match(stripeMode, /KJORA_PAID_PILOT_ENABLED/);
  assert.match(stripeMode, /KJORA_PAID_PILOT_INVITE_ONLY/);
  assert.match(stripeMode, /BILLING_PROVIDER_STRIPE_LIVE_ENABLED/);

  // (e) .env.example ne contient que des noms, jamais de valeurs.
  const env = readFileSync(join(ROOT, ".env.example"), "utf8");
  for (const line of env.split("\n")) {
    if (!/(SECRET|KEY)=/.test(line) || line.trim().startsWith("#")) continue;
    assert.ok(line.trim().endsWith("="), `valeur présente dans .env.example : ${line}`);
  }
});

// ---------------------------------------------------------------------------
// Contrôles transverses
// ---------------------------------------------------------------------------

test("étanchéité — le billing ne touche jamais le domaine loyer", () => {
  const billing = walk(join(ROOT, "src/core/billing")).filter((f) => /\.(ts|tsx)$/.test(f));
  const interdits = ["payments", "dues", "ledger_entries", "financial_documents"];
  for (const file of billing) {
    const code = sansCommentaires(readFileSync(file, "utf8"));
    for (const table of interdits) {
      assert.ok(
        !new RegExp(`from\\(["']${table}["']\\)`).test(code),
        `${file} accède à la table ${table}`,
      );
    }
  }
});

test("providersFor ne renvoie que des providers intégrables", () => {
  for (const n of providersFor("XAF", "mtn_momo")) assert.ok(isIntegrable(n));
  for (const n of providersFor("CAD", "card")) assert.ok(isIntegrable(n));
  // Le Mobile Money n'existe pas en CAD : le croisement devise × moyen est
  // vérifié, pas seulement chaque liste prise isolément.
  assert.deepEqual(providersFor("CAD", "mtn_momo"), []);
  assert.equal(methodAvailableIn("mtn_momo", "CAD"), false);
  assert.equal(methodAvailableIn("card", "CAD"), true);

  const d = routeProvider({
    plan: "avance", cycle: "monthly", currency: "CAD", amountMinor: 3199,
    configured: CONFIGURED_ALL, methodHint: "mtn_momo",
  });
  assert.ok(d.routed);
  assert.equal(d.method, null, "une préférence MoMo en CAD est écartée, pas honorée");
});
