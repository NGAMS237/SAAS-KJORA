import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { defaultsForCountry, sumSameCurrency } from "../src/core/currency/metadata.ts";
import { normalizePhoneE164 } from "../src/modules/communications/manual-whatsapp.ts";
import {
  billingCountryForRentalMarket,
  parseSiteAppIntent,
  subscriptionCurrencyForBillingCountry,
} from "../src/core/onboarding/plan-intent.ts";
import { PRICE_CATALOG, priceFor } from "../src/core/billing/model.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261005205909_country_billing_whatsapp_flow_fix_07.sql");
const onboarding = read("../src/core/organization/organization-onboarding-form.tsx");
const onboardingPage = read("../src/app/onboarding/organization/page.tsx");
const billingView = read("../src/core/billing/billing-view.tsx");
const billingPage = read("../src/app/(internal)/app/billing/page.tsx");
const tenantView = read("../src/modules/tenancy/views.tsx");
const tenantWhatsApp = read("../src/modules/tenancy/tenant-whatsapp-preferences.tsx");
const tenantApi = read("../src/app/api/tenancy/whatsapp/route.ts");
const profileApi = read("../src/app/api/profile/whatsapp/route.ts");
const personalWhatsApp = read("../src/modules/communications/personal-whatsapp-preferences.tsx");
const partnerApi = read("../src/app/api/partners/applications/route.ts");
const providerRouting = read("../src/core/billing/provider-routing.ts");

test("01 — Côte d’Ivoire selected means XOF rental operations", () => {
  assert.deepEqual(defaultsForCountry("CI"), { countryCode: "CI", label: { fr: "Côte d'Ivoire", en: "Ivory Coast" }, currency: "XOF", timezone: "Africa/Abidjan", language: "fr" });
});
test("02 — Côte d’Ivoire selected means XOF subscription", () => assert.equal(subscriptionCurrencyForBillingCountry("CI"), "XOF"));
test("03 — the Ivorian summary contains no residual XAF", () => {
  const ciOption = onboarding.match(/<option value="CI">[^\n]+/i)?.[0] ?? "";
  assert.match(ciOption, /XOF/); assert.doesNotMatch(ciOption, /XAF/);
});
test("04 — Cameroon remains XAF", () => assert.equal(subscriptionCurrencyForBillingCountry("CM"), "XAF"));
test("05 — Canada remains CAD", () => assert.equal(subscriptionCurrencyForBillingCountry("CA"), "CAD"));
test("06 — Discovery stays available without forcing Cameroon billing", () => {
  assert.equal(parseSiteAppIntent({ plan: "decouverte", billing_cycle: "monthly", billing_country: "SN" }).billingCountry, null);
  assert.match(onboarding, /effectiveIntent !== "decouverte"/);
});
test("07 — unpriced rental markets show no fabricated XAF paid price", () => {
  assert.equal(billingCountryForRentalMarket("SN"), null);
  assert.match(onboarding + billingView, /aucun faux prix XAF|no misleading XAF price/i);
});
test("08 — XAF and XOF are neither converted nor added", () => {
  assert.equal(PRICE_CATALOG.XAF.essentiel.monthly, PRICE_CATALOG.XOF.essentiel.monthly);
  assert.throws(() => sumSameCurrency([{ amount: 1, currency: "XAF" }, { amount: 1, currency: "XOF" }]), /currency_mismatch/);
});
test("09 — organizations with billing history are not auto-rewritten", () => {
  assert.match(migration, /not exists\(select 1 from public\.billing_invoices/);
  assert.match(migration, /not exists\(select 1 from public\.billing_payment_attempts/);
  assert.match(migration, /not exists\(select 1 from public\.billing_events/);
});
test("10 — optional Owner WhatsApp is present during onboarding", () => assert.match(onboarding, /PersonalWhatsAppPreferencesForm/));
test("11 — Owner WhatsApp can be skipped", () => assert.match(onboarding, /Continuer ou ignorer WhatsApp|Continue or skip WhatsApp/));
test("12 — CI is preselected and its leading zero is preserved", () => {
  assert.match(onboarding, /billingCountryForRentalMarket\(nextCountry\)/);
  assert.equal(normalizePhoneE164("CI", "0701020304"), "+2250701020304");
});
test("13 — BJ preserves required 01 prefix", () => assert.equal(normalizePhoneE164("BJ", "0197123456"), "+2290197123456"));
test("14 — declaration remains distinct from verification", () => {
  assert.match(personalWhatsApp + tenantWhatsApp, /non vérifié|not verified/);
  assert.doesNotMatch(personalWhatsApp, /whatsappStatus:\s*["']verified/);
});
test("15 — service and marketing consents are separate", () => {
  assert.match(personalWhatsApp, /serviceConsent/); assert.match(personalWhatsApp, /marketingConsent/);
});
test("16 — tenant WhatsApp is offered immediately after creation", () => assert.match(tenantView, /createdTenantId[\s\S]*TenantWhatsAppPreferencesForm/));
test("17 — a landlord can never grant tenant marketing consent", () => {
  assert.match(tenantWhatsApp, /marketingConsent:false/); assert.match(tenantApi, /body\.marketingConsent!==false/);
});
test("18 — WhatsApp failure preserves the created tenant and avoids duplicate creation", () => {
  assert.match(tenantView, /if \(createdTenantId\) return/);
  assert.match(tenantWhatsApp, /réessayez sans recréer le locataire|retry without creating the tenant again/);
});
test("19 — sensitive WhatsApp responses are private and no-store", () => {
  assert.match(tenantApi, /private, no-store/); assert.match(profileApi, /private, no-store/);
});
test("20 — application code does not log full phone values", () => {
  for (const source of [tenantApi, profileApi, tenantWhatsApp, personalWhatsApp]) assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/);
});
test("21 — onboarding resume restores country and existing consent without duplicating resources", () => {
  assert.match(onboardingPage, /get_my_whatsapp_preferences/); assert.match(onboardingPage, /resumedRentalCountry/);
  assert.match(onboarding, /if \(organizationId\)/);
});
test("22 — new flow copy is bilingual", () => {
  for (const phrase of ["Owner WhatsApp", "Rental market country", "Subscription currency", "Communication status", "Skip or finish"]) assert.match(onboarding + billingView + tenantView + tenantWhatsApp, new RegExp(phrase, "i"));
});
test("23 — compatibility is additive and historical migrations are not modified", () => {
  assert.match(migration, /additive repair only/i); assert.doesNotMatch(migration, /drop table|truncate|delete from/i);
});
test("24 — partner application remains on the reviewed shared phone catalog", () => {
  assert.match(partnerApi, /phoneDefaultsForCountry/); assert.match(partnerApi, /submit_partner_application_v2/);
});
test("25 — Stripe Test remains CAD-only", () => {
  assert.match(providerRouting, /input\.currency === "CAD"/);
  assert.match(billingView, /requestedBillingCountry === "CA"/);
});
test("26 — no real provider is called by this lot", () => {
  assert.doesNotMatch(migration + onboarding + tenantView + tenantWhatsApp + billingPage, /api\.stripe\.com|graph\.facebook\.com|resend\.com\/emails/i);
});
test("27 — CI catalog values stay nominal and distinct", () => {
  assert.equal(priceFor("essentiel", "monthly", "XOF"), 5_900);
  assert.equal(priceFor("essentiel", "annual", "XOF"), 59_000);
});
