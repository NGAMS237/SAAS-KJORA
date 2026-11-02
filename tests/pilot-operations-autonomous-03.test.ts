import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { stripeReturnUrl, isStripeTestSecret } from "../src/core/billing/stripe-test-safety.ts";
import { buildProviderTemplatePreviews, maskE164 } from "../src/modules/communications/provider-previews.ts";
import { parseMonthEndSelection } from "../src/modules/documents/month-end.ts";
import { resolveOperationsReadiness } from "../src/modules/platform-admin/operations-readiness.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("la migration de fin de mois déjà alignée reste byte-for-byte inchangée", () => {
  const migration = read("../supabase/migrations/20261001090000_pilot_month_end_africa_preview.sql").replace(/\r\n/g, "\n");
  assert.equal(createHash("sha256").update(migration).digest("hex"), "f7613cca43bc785808d10d0da64d0f0e60d3094314f959ee4f3da60225746324");
});

test("le mois implicite reste null et un autre mois n'est accepté qu'au format fermé", () => {
  assert.deepEqual(parseMonthEndSelection(undefined), { selectedMonth: "", targetMonth: null, invalid: false });
  assert.deepEqual(parseMonthEndSelection("2026-02"), { selectedMonth: "2026-02", targetMonth: "2026-02-01", invalid: false });
  assert.deepEqual(parseMonthEndSelection("2026-13"), { selectedMonth: "", targetMonth: null, invalid: true });
  assert.deepEqual(parseMonthEndSelection(["2026-04", "2025-01"]), { selectedMonth: "2026-04", targetMonth: "2026-04-01", invalid: false });
});

test("la page de documents montre tous les compteurs, des liens utiles et aucun appel fournisseur", () => {
  const page = read("../src/app/(internal)/app/documents/page.tsx");
  const view = read("../src/modules/documents/views.tsx");
  assert.match(page, /target_month: monthSelection\.targetMonth/);
  assert.match(page, /target_month: null/);
  for (const field of ["leasesSelected", "duesSelected", "documentsPrepared", "documentsMissing", "awaitingApproval", "deferred", "approved", "queued", "sent"]) {
    assert.match(view, new RegExp(`preview\\.${field}`));
  }
  assert.match(view, /href="#documents"/);
  assert.match(view, /href="\/app\/activite#notifications"/);
  assert.doesNotMatch(`${page}\n${view}`, /fetch\(["']https?:\/\//);
});

test("le centre Admin ne confond jamais configuration locale et preuve fournisseur", () => {
  const disabled = resolveOperationsReadiness({}, {
    africaOverviewAvailable: false, resendProviderEvidence: false, automationRunObserved: false,
  });
  assert.equal(disabled.stripe_test.status, "configured_disabled");
  assert.equal(disabled.resend.status, "configured_disabled");
  assert.equal(disabled.whatsapp_api.status, "configured_disabled");
  assert.equal(disabled.whatsapp_manual.status, "attention_required");

  const enabled = resolveOperationsReadiness({
    BILLING_PROVIDER_STRIPE_TEST_ENABLED: "1",
    STRIPE_SANDBOX_SECRET_KEY: "sk_test_fixture",
    STRIPE_SANDBOX_WEBHOOK_SECRET: "whsec_fixture",
    KJORA_APP_ORIGIN: "https://preview.example.test/",
    STRIPE_TEST_PRICE_ESSENTIEL_MONTHLY_CAD: "price_1",
    STRIPE_TEST_PRICE_ESSENTIEL_ANNUAL_CAD: "price_2",
    STRIPE_TEST_PRICE_AVANCE_MONTHLY_CAD: "price_3",
    STRIPE_TEST_PRICE_AVANCE_ANNUAL_CAD: "price_4",
    STRIPE_TEST_PRICE_PATRIMOINE_MONTHLY_CAD: "price_5",
    STRIPE_TEST_PRICE_PATRIMOINE_ANNUAL_CAD: "price_6",
    KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED: "true",
    RESEND_TRANSACTIONAL_API_KEY: "fixture-key",
    KJORA_TRANSACTIONAL_EMAIL_FROM: "KJORA <test@example.test>",
    RESEND_WEBHOOK_SECRET: "fixture-webhook",
    CRON_SECRET: "fixture-cron-secret-long",
  }, { africaOverviewAvailable: true, resendProviderEvidence: false, automationRunObserved: false });
  assert.equal(enabled.stripe_test.status, "attention_required");
  assert.equal(enabled.resend.status, "attention_required");
  assert.equal(enabled.automations.status, "attention_required");
  assert.deepEqual(enabled.stripe_test.missing, []);
  assert.equal(resolveOperationsReadiness({ ...{}, KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED: "true" }, {
    africaOverviewAvailable: false, resendProviderEvidence: false, automationRunObserved: false,
  }).resend.status, "configuration_missing");
});

test("Stripe Test refuse les clés live et les URLs de retour externes ou ambiguës", () => {
  assert.equal(isStripeTestSecret("sk_test_fixture"), true);
  assert.equal(isStripeTestSecret("sk_" + "live_fixture"), false);
  assert.equal(stripeReturnUrl("https://preview.example.test/", "/app/billing?checkout=success"), "https://preview.example.test/app/billing?checkout=success");
  for (const path of ["//evil.test/", "https://evil.test/", "/\\evil.test/"]) {
    assert.throws(() => stripeReturnUrl("https://preview.example.test/", path), /NOT_ALLOWED/);
  }
  assert.throws(() => stripeReturnUrl("http://preview.example.test/", "/app/billing"), /NOT_ALLOWED/);
});

test("les aperçus fournisseur sont locaux, fictifs et masquent le numéro WhatsApp", () => {
  const previews = buildProviderTemplatePreviews();
  assert.equal(previews.filter((item) => item.channel === "email").length, 4);
  const whatsapp = previews.find((item) => item.channel === "whatsapp");
  assert.ok(whatsapp?.recipientMasked?.includes("•"));
  assert.doesNotMatch(JSON.stringify(previews), /\+237600000000/);
  assert.equal(maskE164("not-a-number"), null);
  assert.doesNotMatch(read("../src/modules/communications/provider-previews.ts"), /\bfetch\(|axios|whatsapp-web/i);
});

test("la candidature partenaire exige une origine same-site et rend les conditions visibles", () => {
  const route = read("../src/app/api/partners/applications/route.ts");
  const page = read("../src/app/partenaires/page.tsx");
  assert.match(route, /if \(!isSameOrigin\(request, \{ requireOrigin: true \}\)\)/);
  assert.match(route, /status:403/);
  assert.match(page, /Conditions visibles avant candidature/);
  assert.match(page, /No compensation, amount, or percentage is promised/);
  assert.match(page, /href="\/confidentialite"/);
});
