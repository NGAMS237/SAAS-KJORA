import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isProductionDeployment } from "../src/modules/communications/config.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const packageJson = JSON.parse(read("package.json")) as { engines?: { node?: string }; scripts?: Record<string, string> };
const envExample = read(".env.example");
const providerConfig = read("src/core/billing/provider-config.ts");
const providerBootstrap = read("src/core/billing/provider-bootstrap.ts");
const stripeAdapter = read("src/core/billing/adapters/stripe-test-adapter.ts");
const stripeWebhook = read("src/app/api/billing/webhooks/[provider]/route.ts");
const resendWebhook = read("src/app/api/webhooks/resend/route.ts");
const serviceWorker = read("public/sw.js");

test("Hostinger cible explicitement Node.js 22 et les scripts Next.js standard", () => {
  assert.equal(packageJson.engines?.node, "22.x");
  assert.equal(packageJson.scripts?.build, "next build");
  assert.equal(packageJson.scripts?.start, "next start");
});

test("un next start auto-hébergé est traité comme Production sans VERCEL_ENV", () => {
  assert.equal(isProductionDeployment({ NODE_ENV: "production" }), true);
  assert.equal(isProductionDeployment({ NODE_ENV: "development" }), false);
  assert.equal(isProductionDeployment({}), false);
});

test("VERCEL_ENV garde la priorité afin qu'une Preview ne devienne pas Production", () => {
  assert.equal(isProductionDeployment({ VERCEL_ENV: "preview", NODE_ENV: "production" }), false);
  assert.equal(isProductionDeployment({ VERCEL_ENV: "production", NODE_ENV: "production" }), true);
});

test("Stripe Test reste désactivé et coupé dans l'exemple Hostinger", () => {
  assert.match(envExample, /^BILLING_PROVIDER_STRIPE_TEST_ENABLED=0$/m);
  assert.match(envExample, /^BILLING_KILL_SWITCH_ALL=1$/m);
  assert.match(envExample, /^BILLING_KILL_SWITCH_STRIPE=1$/m);
  assert.match(envExample, /^KJORA_APP_ORIGIN=https:\/\/kjorapp\.com$/m);
  assert.match(envExample, /^KJORA_COMMERCIAL_SITE_URL=https:\/\/kjorapp\.com$/m);
  assert.doesNotMatch(envExample, /kjora\.kjemostudios\.com/);
});

test("Resend financier, facturation automatique et Meta restent désactivés", () => {
  assert.match(envExample, /^KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED=false$/m);
  assert.match(envExample, /^KJORA_SAAS_AUTO_INVOICING_ENABLED=false$/m);
  assert.match(envExample, /^KJORA_WHATSAPP_PROVIDER=disabled$/m);
});

test("aucun provider Afrique ou Meta n'est enregistré par le bootstrap", () => {
  assert.match(providerBootstrap, /registerBillingProvider\(createStripeAdapter/);
  assert.doesNotMatch(providerBootstrap, /Flutterwave|CamPay|ElyonPay|Meta/i);
  assert.match(providerConfig, /if \(testEnabled === liveEnabled\) return null/);
});

test("les retours Stripe proviennent de l'origine serveur et le portail reste interne", () => {
  assert.match(stripeAdapter, /process\.env\.KJORA_APP_ORIGIN/);
  assert.match(stripeAdapter, /absoluteReturnUrl\(request\.returnPath\)/);
  assert.doesNotMatch(stripeAdapter, /NEXT_PUBLIC_.*STRIPE/);
  assert.match(stripeAdapter, /STRIPE_ENVIRONMENT_KEY_MISMATCH/);
});

test("les webhooks conservent le corps brut avant vérification", () => {
  assert.match(stripeWebhook, /const rawBody = await request\.text\(\)/);
  assert.match(stripeWebhook, /verifyWebhook\(rawBody, headers\)/);
  assert.match(resendWebhook, /const raw = await request\.text\(\)/);
  assert.match(resendWebhook, /verifyResendWebhook[\s\S]*, raw\)/);
});

test("le cache PWA refuse API, espaces privés et documents", () => {
  for (const prefix of ["/api/", "/app/", "/administration/", "/portal/"]) {
    assert.ok(serviceWorker.includes(`\"${prefix}\"`), `${prefix} doit rester exclu`);
  }
  assert.match(serviceWorker, /private\|no-store/i);
  assert.match(serviceWorker, /documents/);
});

test(".env.example ne contient aucun secret plausible", () => {
  assert.doesNotMatch(envExample, /sk_(?:live|test)_[A-Za-z0-9]{8,}/);
  assert.doesNotMatch(envExample, /whsec_[A-Za-z0-9]{8,}/);
  assert.doesNotMatch(envExample, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
});
