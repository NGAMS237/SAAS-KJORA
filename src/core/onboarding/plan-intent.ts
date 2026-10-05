// =============================================================================
// KJORA — Site → App intent contract (SITE-APP-FLOW-01)
// =============================================================================
// Every value in this module can originate in a public URL. It is therefore an
// untrusted acquisition intent, never an authorization or billing instruction.
// Identity, Organization, capabilities, prices and the effective plan continue
// to come from authenticated server-side state.
// =============================================================================

import { isBillingCycle, type BillingCurrency, type BillingCycle } from "../billing/model.ts";
import { isPlanSlug, type PlanSlug, PLAN_LABELS } from "../entitlements/model.ts";

type UrlValue = string | string[] | null | undefined;

export const SITE_APP_LOCALES = ["fr", "en"] as const;
export type SiteAppLocale = (typeof SITE_APP_LOCALES)[number];

// Deliberately narrow. Every new source requires a reviewed code change.
export const SITE_APP_SOURCES = ["site"] as const;
export type SiteAppSource = (typeof SITE_APP_SOURCES)[number];

export const BILLING_COUNTRIES = ["CA", "CM", "CI"] as const;
export type BillingCountry = (typeof BILLING_COUNTRIES)[number];

export function isBillingCountry(value: unknown): value is BillingCountry {
  return typeof value === "string"
    && (BILLING_COUNTRIES as readonly string[]).includes(value);
}

export type SiteAppIntent = {
  plan: PlanSlug | null;
  billingCycle: BillingCycle | null;
  billingCountry: BillingCountry | null;
  locale: SiteAppLocale;
  source: SiteAppSource | null;
};

export type SiteAppSearchParams = {
  plan?: UrlValue;
  /** Legacy ALIGN-02 input, retained only for old bookmarks. */
  plan_requested?: UrlValue;
  billing_cycle?: UrlValue;
  billing_country?: UrlValue;
  locale?: UrlValue;
  source?: UrlValue;
};

function first(value: UrlValue): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim().toLowerCase() : null;
}

export function parsePlanRequested(value: UrlValue): PlanSlug | null {
  const raw = first(value);
  return raw && isPlanSlug(raw) ? raw : null;
}

export function parseSiteAppIntent(params: SiteAppSearchParams): SiteAppIntent {
  // A present canonical `plan` always wins, even when invalid. This avoids
  // silently falling back to a second, legacy parameter.
  const planValue = params.plan !== undefined ? params.plan : params.plan_requested;
  const rawCycle = first(params.billing_cycle);
  const rawBillingCountry = first(params.billing_country)?.toUpperCase() ?? null;
  const rawLocale = first(params.locale);
  const rawSource = first(params.source);

  return {
    plan: parsePlanRequested(planValue),
    billingCycle: rawCycle && isBillingCycle(rawCycle) ? rawCycle : null,
    billingCountry: rawBillingCountry
      && (BILLING_COUNTRIES as readonly string[]).includes(rawBillingCountry)
      ? rawBillingCountry as BillingCountry
      : null,
    locale: rawLocale && (SITE_APP_LOCALES as readonly string[]).includes(rawLocale)
      ? rawLocale as SiteAppLocale
      : "fr",
    source: rawSource && (SITE_APP_SOURCES as readonly string[]).includes(rawSource)
      ? rawSource as SiteAppSource
      : null,
  };
}

/** Serialize only allowlisted acquisition fields. */
export function siteAppIntentSearchParams(intent: SiteAppIntent): URLSearchParams {
  const params = new URLSearchParams();
  if (intent.plan) params.set("plan", intent.plan);
  if (intent.billingCycle) params.set("billing_cycle", intent.billingCycle);
  if (intent.billingCountry) params.set("billing_country", intent.billingCountry);
  params.set("locale", intent.locale);
  if (intent.source) params.set("source", intent.source);
  return params;
}

export function isCompleteSiteAppIntent(intent: SiteAppIntent): boolean {
  return Boolean(intent.plan && intent.billingCycle && intent.billingCountry);
}

/** A canonical commercial link is valid before the in-app country confirmation. */
export function isReplaceableIncomingIntent(intent: SiteAppIntent): boolean {
  return Boolean(intent.plan && intent.billingCycle);
}

/**
 * Replacement rule: a valid new plan+cycle selection wins. Its billing country
 * may deliberately remain null so the app asks for an explicit choice instead
 * of silently inheriting the old market. A malformed/partial URL cannot erase
 * a durable selection. This grants no capability or entitlement.
 */
export function mergeSiteAppIntent(
  incoming: SiteAppIntent,
  stored: SiteAppIntent | null,
): SiteAppIntent {
  if (isReplaceableIncomingIntent(incoming)) return incoming;
  return stored ?? incoming;
}

export function subscriptionCurrencyForBillingCountry(
  country: BillingCountry,
): BillingCurrency {
  if (country === "CA") return "CAD";
  if (country === "CI") return "XOF";
  return "XAF";
}

/** A rental market suggests a billing market only when KJORA has a reviewed price. */
export function billingCountryForRentalMarket(country: string): BillingCountry | null {
  return isBillingCountry(country) ? country : null;
}

export function appendSiteAppIntent(path: string, intent: SiteAppIntent): string {
  const [pathname, existing = ""] = path.split("?", 2);
  const params = new URLSearchParams(existing);
  for (const [key, value] of siteAppIntentSearchParams(intent)) params.set(key, value);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function isSurMesure(plan: PlanSlug | null): boolean {
  return plan === "sur_mesure";
}

export function needsIntentPreservation(plan: PlanSlug | null): boolean {
  return plan === "essentiel" || plan === "avance" || plan === "patrimoine";
}

export function planLabel(plan: PlanSlug | null, lang: SiteAppLocale = "fr"): string {
  if (!plan) return "";
  return PLAN_LABELS[plan]?.[lang] ?? plan;
}

/** Preserve validated intent through PKCE; safeNextPath validates `next`. */
export function buildConnexionUrl(intent: SiteAppIntent): string {
  const loginParams = siteAppIntentSearchParams(intent);
  const nextPath = intent.plan
    ? appendSiteAppIntent("/onboarding/organization", intent)
    : "/app";
  loginParams.set("next", nextPath);
  return `/connexion?${loginParams.toString()}`;
}

/** Découverte enters the app; paid self-serve plans enter safe billing prep. */
export function destinationAfterOnboarding(intent: SiteAppIntent): string {
  return needsIntentPreservation(intent.plan)
    ? appendSiteAppIntent("/app/billing", intent)
    : "/app";
}

export const SUR_MESURE_CONTACT_URL = "https://kjorapp.com/contact";

export function buildSurMesureContactUrl(intent: SiteAppIntent): string {
  const url = new URL(SUR_MESURE_CONTACT_URL);
  url.searchParams.set("plan", "sur_mesure");
  url.searchParams.set("locale", intent.locale);
  if (intent.source) url.searchParams.set("source", intent.source);
  return url.toString();
}
