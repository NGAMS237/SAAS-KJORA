import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  mergeSiteAppIntent,
  parseSiteAppIntent,
  siteAppIntentSearchParams,
  subscriptionCurrencyForBillingCountry,
  type SiteAppIntent,
  type SiteAppSearchParams,
} from "../src/core/onboarding/plan-intent.ts";
import {
  parseOnboardingState,
  siteAppIntentFromOnboardingState,
} from "../src/core/onboarding/onboarding-state.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20260911210927_site_app_flow_canada_intent.sql");
const organizationForm = read("../src/core/organization/organization-onboarding-form.tsx");
const loginForm = read("../src/core/auth/login-form.tsx");
const connectionPage = read("../src/app/connexion/page.tsx");
const billingView = read("../src/core/billing/billing-view.tsx");
const billingApi = read("../src/app/api/billing/route.ts");
const onboardingApi = read("../src/app/api/onboarding/route.ts");
const onboardingServer = read("../src/core/onboarding/server.ts");
const exportReader = read("../src/modules/data-export/server.ts");

const storedAnnualCanada: SiteAppIntent = {
  plan: "avance",
  billingCycle: "annual",
  billingCountry: "CA",
  locale: "en",
  source: "site",
};

test("Canada maps to CAD on the server-controlled subscription market", () => {
  assert.equal(subscriptionCurrencyForBillingCountry("CA"), "CAD");
  assert.match(migration, /when 'CA' then 'CAD'/i);
  assert.match(migration, /billing_country = 'CA' and currency = 'CAD'/i);
});

test("Cameroon rental operations remain XAF even for a Canadian subscription", () => {
  assert.match(organizationForm, /Rental market[\s\S]*Cameroon[\s\S]*Rental currency[\s\S]*XAF/i);
  assert.match(migration, /leaves organization_profiles\.currency_code[\s\S]*untouched/i);
  assert.doesNotMatch(migration, /update\s+public\.organization_profiles/i);
});

test("Cameroon maps to XAF for the SaaS subscription", () => {
  assert.equal(subscriptionCurrencyForBillingCountry("CM"), "XAF");
  assert.match(migration, /when 'CA' then 'CAD' else 'XAF'/i);
  assert.match(migration, /billing_country = 'CM' and currency = 'XAF'/i);
});

test("a currency injected into the URL is ignored", () => {
  const parsed = parseSiteAppIntent({
    plan: "essentiel",
    billing_cycle: "monthly",
    billing_country: "CA",
    locale: "fr",
    source: "site",
    currency: "USD",
  } as SiteAppSearchParams & { currency: string });
  assert.deepEqual(parsed, {
    plan: "essentiel",
    billingCycle: "monthly",
    billingCountry: "CA",
    locale: "fr",
    source: "site",
  });
  assert.equal(siteAppIntentSearchParams(parsed).has("currency"), false);
  assert.doesNotMatch(billingApi, /body\.currency/);
});

test("an invalid billing country is rejected instead of becoming currency", () => {
  assert.equal(parseSiteAppIntent({ billing_country: "US" }).billingCountry, null);
  assert.match(onboardingApi, /invalid_site_app_intent/);
  assert.match(billingApi, /isBillingCountry\(body\.billing_country\)/);
  assert.match(migration, /target_billing_country not in \('CA','CM'\)/);
});

test("annual intent resumes after interruption", () => {
  const state = parseOnboardingState({
    exists: true,
    step: "completed",
    plan_intent: "avance",
    billing_cycle_intent: "annual",
    billing_country_intent: "CA",
    locale_intent: "en",
    source_intent: "site",
    intent_status: "active",
  });
  assert.deepEqual(siteAppIntentFromOnboardingState(state), storedAnnualCanada);
  assert.equal(mergeSiteAppIntent(parseSiteAppIntent({}), storedAnnualCanada).billingCycle, "annual");
});

test("a complete new intent atomically replaces the old intent", () => {
  const incoming = parseSiteAppIntent({
    plan: "patrimoine",
    billing_cycle: "monthly",
    billing_country: "CM",
    locale: "fr",
    source: "site",
  });
  assert.deepEqual(mergeSiteAppIntent(incoming, storedAnnualCanada), incoming);
  assert.match(migration, /on conflict \(user_id\) do update set[\s\S]*billing_country_intent = excluded\.billing_country_intent/i);
});

test("a valid new link replaces the old intent without inheriting its billing country", () => {
  const incoming = parseSiteAppIntent({
    plan: "essentiel", billing_cycle: "annual", locale: "fr", source: "site",
  });
  assert.deepEqual(mergeSiteAppIntent(incoming, storedAnnualCanada), incoming);
  assert.equal(incoming.billingCountry, null);
  assert.match(migration, /target_billing_country is not null and target_billing_country not in \('CA','CM'\)/);
  assert.match(onboardingServer, /persistIncomingSiteAppIntent[\s\S]*replace_site_app_intent/);
});

test("an incomplete or invalid new URL cannot silently erase the stored intent", () => {
  const incomplete = parseSiteAppIntent({ plan: "essentiel" });
  assert.deepEqual(mergeSiteAppIntent(incomplete, storedAnnualCanada), storedAnnualCanada);
});

test("Découverte remains free and needs no payment", () => {
  assert.match(billingView, /Gratuit, sans moyen de paiement/);
  assert.match(billingView, /No payment or Stripe Checkout is started/);
  assert.doesNotMatch(migration, /insert into public\.organization_plans[\s\S]{0,200}'decouverte'/i);
});

test("the newly added commercial journey exposes complete English copy", () => {
  for (const [source, phrase] of [
    [connectionPage, "Access your rental workspace"],
    [loginForm, "Send my access link"],
    [organizationForm, "Create my workspace"],
    [organizationForm, "KJORA billing country"],
    [organizationForm, "Unable to save your subscription selection"],
    [organizationForm, "Creating…"],
    [billingView, "Subscription currency"],
    [billingView, "Subscription & billing"],
    [billingView, "Change plan"],
    [billingView, "No invoices"],
    [billingView, "Prepare this plan"],
    [billingView, "Preparing…"],
    [billingView, "Unable to save this selection"],
  ] as const) assert.match(source, new RegExp(phrase, "i"));
});

test("URL intent never activates a paid entitlement", () => {
  const replacementRpc = migration.slice(
    migration.indexOf("create or replace function public.replace_site_app_intent"),
    migration.indexOf("create or replace function public.prepare_plan_change_for_market"),
  );
  assert.doesNotMatch(replacementRpc, /organization_plans|activate_pending_plan|subscription.*status\s*=\s*'active'/i);
  assert.match(billingView, /records an upgrade request only/i);
});

test("EXPORT-01 still uses its secured list_contracts_for_export RPC", () => {
  assert.match(exportReader, /supabase\.rpc\("list_contracts_for_export"/);
  assert.doesNotMatch(exportReader, /\.from\("lease_contracts"\)/);
});

test("Canada intent code does not implement or call Stripe or SASPAY", () => {
  assert.doesNotMatch(migration, /stripe|saspay|checkout|webhook/i);
  assert.doesNotMatch(onboardingApi, /stripe|saspay|checkout|webhook/i);
  assert.doesNotMatch(billingApi, /stripe|saspay|checkout|webhook/i);
});

test("new intent RPCs are authenticated, deny anon, and use a safe search path", () => {
  for (const name of ["replace_site_app_intent", "prepare_plan_change_for_market"]) {
    assert.match(migration, new RegExp(`function public\\.${name}[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`, "i"));
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}[\\s\\S]*?from public, anon`, "i"));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}[\\s\\S]*?to authenticated`, "i"));
  }
});

test("subscription market preparation serializes concurrent first creation", () => {
  const marketRpc = migration.slice(
    migration.indexOf("create or replace function public.prepare_plan_change_for_market"),
  );
  assert.match(marketRpc, /perform 1 from public\.organizations[\s\S]*for update/i);
  assert.match(marketRpc, /select \* into sub from public\.organization_subscriptions[\s\S]*for update/i);
  assert.ok(
    marketRpc.indexOf("perform 1 from public.organizations")
      < marketRpc.indexOf("insert into public.organization_subscriptions"),
    "the stable parent row must be locked before a possibly concurrent insert",
  );
});

test("required RPC inputs reject SQL NULL instead of relying on NOT IN", () => {
  assert.match(
    migration,
    /target_plan is null[\s\S]*target_cycle is null[\s\S]*target_locale is null/,
  );
  assert.match(
    migration,
    /target_cycle is null[\s\S]*target_billing_country is null[\s\S]*target_billing_country not in \('CA','CM'\)/,
  );
});
