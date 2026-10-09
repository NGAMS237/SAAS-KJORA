"use client";

// =============================================================================
// ALIGN-02 — Onboarding propriétaire, reprenable et idempotent
// =============================================================================
// Étapes : Organization → moyen d'encaissement → premier bien → premier logement
//          → dashboard réel.
//
// Idempotence : chaque ressource créée est immédiatement enregistrée dans
// onboarding_states. Une ressource déjà enregistrée n'est jamais recréée, ce qui
// neutralise le double-submit et la reprise après interruption.
//
// Le plan effectif est toujours Découverte : aucun plan payant n'est activé ici.
// =============================================================================

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ORGANIZATION_TIMEZONES } from "@/core/organization/settings";
import { SUPPORTED_COUNTRIES, RENTAL_CURRENCIES, defaultsForCountry } from "@/core/currency/metadata";
import { trackEvent } from "@/core/analytics/events";
import {
  billingCountryForRentalMarket,
  destinationAfterOnboarding,
  subscriptionCurrencyForBillingCountry,
  needsIntentPreservation,
  planLabel,
  type SiteAppLocale,
  type SiteAppSource,
  type BillingCountry,
} from "@/core/onboarding/plan-intent";
import {
  PersonalWhatsAppPreferencesForm,
  type PersonalWhatsAppPreferences,
} from "@/modules/communications/personal-whatsapp-preferences";
import type { BillingCycle } from "@/core/billing/model";
import {
  RENT_COLLECTION_LABELS,
  RENT_COLLECTION_METHODS,
  type OnboardingState,
  type OnboardingStep,
  type RentCollectionMethod,
} from "@/core/onboarding/onboarding-state";
import type { PlanSlug } from "@/core/entitlements/model";

type QuotaError = { quota: number | null; current: number };

const RENT_COLLECTION_LABELS_EN: Record<RentCollectionMethod, string> = {
  mtn_momo: "MTN MoMo on my personal number",
  orange_money: "Orange Money on my personal number",
  merchant_account: "Merchant account",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  multiple: "Several methods",
};

async function patchOnboarding(payload: Record<string, unknown>) {
  const response = await fetch("/api/onboarding", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { state?: OnboardingState };
  return body.state ?? null;
}

export function OrganizationOnboardingForm({
  initialState,
  planRequested = null,
  billingCycle = null,
  billingCountry = null,
  locale = "fr",
  source = null,
  isNewCommercialIntent = false,
  isNewOrgRequest = false,
  initialWhatsAppPreferences = {},
  resumedRentalCountry = null,
}: {
  initialState: OnboardingState;
  planRequested?: PlanSlug | null;
  billingCycle?: BillingCycle | null;
  billingCountry?: BillingCountry | null;
  locale?: SiteAppLocale;
  source?: SiteAppSource | null;
  isNewCommercialIntent?: boolean;
  isNewOrgRequest?: boolean;
  initialWhatsAppPreferences?: PersonalWhatsAppPreferences;
  resumedRentalCountry?: string | null;
}) {
  const router = useRouter();

  // L'étape de départ vient du serveur : c'est ce qui rend le parcours reprenable.
  const [step, setStep] = useState<OnboardingStep>(
    isNewOrgRequest ? "plan_intent" : initialState.step,
  );
  const [organizationId, setOrganizationId] = useState<string | null>(
    isNewOrgRequest ? null : initialState.organizationId,
  );
  const [propertyId, setPropertyId] = useState<string | null>(initialState.firstPropertyId);
  const [propertyType, setPropertyType] = useState<"house" | "building">("house");

  const [name, setName] = useState("");
  // AFRICA-CONTRACTS-PERFORMANCE-01 — AXE A : pays du marché locatif de cette
  // Organization, avec CM comme valeur historique par défaut (rétrocompatible
  // avec le comportement précédent). Choisir un pays propose aussitôt la
  // devise, le fuseau horaire et la langue cohérents avec ce pays — ce sont
  // des PROPOSITIONS modifiables, jamais un couplage imposé côté base : la
  // devise reste librement changeable ensuite depuis Paramètres tant
  // qu'aucune opération financière n'existe.
  const resumedDefaults = resumedRentalCountry ? defaultsForCountry(resumedRentalCountry) : null;
  const [country, setCountry] = useState<string>(resumedDefaults?.countryCode ?? "CM");
  const [currency, setCurrency] = useState<string>(resumedDefaults?.currency ?? "XAF");
  const [language, setLanguage] = useState<"fr" | "en">(locale);
  const [timezone, setTimezone] = useState(resumedDefaults?.timezone ?? "Africa/Douala");
  const [rentMethod, setRentMethod] = useState<RentCollectionMethod | "">(
    initialState.rentCollectionMethod ?? "",
  );
  const [propertyName, setPropertyName] = useState("");
  const [propertyLocality, setPropertyLocality] = useState("");
  const [referenceRent, setReferenceRent] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle | "">(
    billingCycle ?? initialState.billingCycleIntent ?? "",
  );
  const [selectedBillingCountry, setSelectedBillingCountry] = useState<BillingCountry | "">(
    billingCountry
      ?? (isNewCommercialIntent ? "" : initialState.billingCountryIntent)
      ?? billingCountryForRentalMarket(resumedDefaults?.countryCode ?? "CM")
      ?? "",
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState<QuotaError | null>(null);

  // Verrou anti-double-submit côté client, en complément de l'idempotence serveur
  const inFlight = useRef(false);

  const effectiveIntent = planRequested ?? initialState.planIntent ?? "decouverte";
  const flowIntent = {
    plan: effectiveIntent,
    billingCycle: selectedCycle || null,
    billingCountry: selectedBillingCountry || null,
    locale,
    source,
  } as const;
  const t = (fr: string, en: string) => locale === "en" ? en : fr;

  async function replaceIntent(
    cycle: BillingCycle | "" = selectedCycle,
    country: BillingCountry | "" = selectedBillingCountry,
  ) {
    if (!effectiveIntent || !cycle || !country) return false;
    return Boolean(await patchOnboarding({
      intent_mode: "replace",
      plan_intent: effectiveIntent,
      billing_cycle_intent: cycle,
      billing_country_intent: country,
      locale_intent: locale,
      source_intent: source,
    }));
  }

  useEffect(() => {
    trackEvent("onboarding_started", {
      plan_intent: effectiveIntent,
      resumed: initialState.exists && initialState.step !== "plan_intent",
    });
    // A complete new intent atomically replaces the previous one. It remains
    // acquisition metadata and never activates a paid plan.
    if (effectiveIntent && selectedCycle && selectedBillingCountry) {
      trackEvent("plan_intent_received", { plan_intent: effectiveIntent, activated: false });
      void replaceIntent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AFRICA-CONTRACTS-PERFORMANCE-01 — AXE A : applique les valeurs par
  // défaut cohérentes du pays choisi (devise, fuseau, langue). L'utilisateur
  // reste libre de modifier ensuite chacun de ces champs individuellement —
  // ce ne sont que des propositions de départ, jamais un verrou.
  function applyCountryDefaults(nextCountry: string) {
    setCountry(nextCountry);
    const defaults = defaultsForCountry(nextCountry);
    if (defaults) {
      setCurrency(defaults.currency);
      setTimezone(defaults.timezone);
      setLanguage(defaults.language);
    }
    setSelectedBillingCountry(billingCountryForRentalMarket(nextCountry) ?? "");
  }

  const guard = useCallback(async (fn: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  // ─── Organization ──────────────────────────────────────────────────────────
  async function submitOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await guard(async () => {
      if (!selectedCycle || (!selectedBillingCountry && effectiveIntent !== "decouverte")) {
        setError(t(
          "Choisissez le cycle et le pays de facturation de l’abonnement.",
          "Choose the subscription billing cycle and country.",
        ));
        return;
      }
      if (selectedBillingCountry && !await replaceIntent()) {
        setError(t(
          "Impossible d’enregistrer votre choix d’abonnement. Réessayez.",
          "Unable to save your subscription selection. Try again.",
        ));
        return;
      }
      // Idempotence : une Organization déjà créée n'est jamais recréée
      if (organizationId) {
        setStep("rent_method");
        return;
      }

      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), language, timezone, country, currency }),
      });

      if (response.status === 403) {
        const body = (await response.json()) as {
          error?: string; quota?: number | null; current?: number;
        };
        if (body.error === "PLAN_ORGANIZATION_LIMIT_REACHED") {
          setQuotaError({ quota: body.quota ?? null, current: body.current ?? 0 });
          setStep("plan_intent");
          setError("quota");
          return;
        }
      }
      if (!response.ok) {
        setError(t("Impossible de créer l'organisation. Vérifiez les informations et réessayez.", "Unable to create the organization. Check the information and try again."));
        return;
      }

      const { organizationId: createdId } = (await response.json()) as { organizationId: string };
      setOrganizationId(createdId);
      trackEvent("organization_created", {
        plan_effective: "decouverte",
        plan_intent: effectiveIntent,
      });
      await patchOnboarding({ organization_id: createdId, step: "rent_method" });
      setStep("rent_method");
    });
  }

  // ─── Moyen d'encaissement ──────────────────────────────────────────────────
  async function submitRentMethod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await guard(async () => {
      await patchOnboarding({
        rent_collection_method: rentMethod || null,
        step: "property",
      });
      setStep("property");
    });
  }

  // ─── Premier bien ──────────────────────────────────────────────────────────
  async function submitProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await guard(async () => {
      if (propertyId) {
        setStep("unit");
        return;
      }
      const rent = referenceRent.trim() ? Number(referenceRent) : null;
      const response = await fetch("/api/rentals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create_property",
          name: propertyName.trim(),
          locality: propertyLocality.trim(),
          type: propertyType,
          referenceRentXaf: propertyType === "house" && rent && rent > 0 ? rent : null,
        }),
      });
      if (!response.ok) {
        setError(t("Impossible de créer ce bien. Vérifiez les informations et réessayez.", "Unable to create this property. Check the information and try again."));
        return;
      }
      const { propertyId: createdId } = (await response.json()) as { propertyId: string };
      setPropertyId(createdId);
      trackEvent("first_property_created", { property_type: propertyType });
      await patchOnboarding({ first_property_id: createdId, step: "unit" });

      // Une maison reçoit automatiquement son logement « Maison entière »
      if (propertyType === "house") {
        await patchOnboarding({ step: "completed" });
        trackEvent("first_unit_created", { unit_type: "whole_house" });
        finish();
        return;
      }
      setStep("unit");
    });
  }

  // ─── Premier logement (immeuble uniquement) ────────────────────────────────
  async function submitUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await guard(async () => {
      const rent = referenceRent.trim() ? Number(referenceRent) : null;
      const response = await fetch("/api/rentals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create_unit",
          propertyId,
          label: unitLabel.trim(),
          type: "apartment",
          referenceRentXaf: rent && rent > 0 ? rent : null,
        }),
      });
      if (!response.ok) {
        setError(t("Impossible de créer ce logement. Vérifiez les informations et réessayez.", "Unable to create this unit. Check the information and try again."));
        return;
      }
      const { unitId } = (await response.json()) as { unitId: string };
      trackEvent("first_unit_created", { unit_type: "apartment" });
      await patchOnboarding({ first_unit_id: unitId, step: "completed" });
      finish();
    });
  }

  function finish() {
    trackEvent("onboarding_completed", { plan_effective: "decouverte" });
    router.replace(destinationAfterOnboarding(flowIntent));
    router.refresh();
  }

  async function skipToApp() {
    await patchOnboarding({ step: "completed" });
    finish();
  }

  // ─── Quota dépassé ─────────────────────────────────────────────────────────
  if (error === "quota" && quotaError) {
    return (
      <div className="onboarding-quota-blocked">
        <p className="form-feedback form-feedback--error" role="alert">
          {t("Votre plan actuel n’autorise pas d’organisation supplémentaire", "Your current plan does not allow another organization")}
          {quotaError.quota != null ? t(` (limite : ${quotaError.quota}, actuel : ${quotaError.current})`, ` (limit: ${quotaError.quota}, current: ${quotaError.current})`) : ""}.
        </p>
        <p className="auth-intro">
          {t("Aucune organisation existante n’est modifiée. Un plan supérieur est nécessaire pour en ajouter une.", "No existing organization is changed. A higher plan is required to add one.")}
        </p>
        <a className="button button--primary" href="/app">{t("Retour à mon espace", "Back to my workspace")}</a>
      </div>
    );
  }

  // ─── Étape Organization ────────────────────────────────────────────────────
  if (step === "plan_intent" || step === "organization" || !organizationId) {
    return (
      <form className="form-stack" onSubmit={submitOrganization}>
        {needsIntentPreservation(effectiveIntent) ? (
          <p className="onboarding-plan-note">
            {t("Plan visé", "Selected plan")}: <strong>{planLabel(effectiveIntent, locale)}</strong> · {t("Démarrage sur Découverte, sans paiement.", "Start on Discovery with no payment.")}
          </p>
        ) : null}
        <label className="field">
          <span>{t("Nom de l’organisation", "Organization name")}</span>
          <input
            autoFocus maxLength={120} minLength={2} name="name" required
            onChange={(e) => setName(e.target.value)}
            placeholder={t("Ex. Horizon Habitat", "E.g. Horizon Housing")} value={name}
          />
        </label>
        <div className="form-grid">
          <label className="field">
            <span>{t("Pays du marché locatif", "Rental market country")}</span>
            <select name="country" required value={country}
              onChange={(e) => applyCountryDefaults(e.target.value)}>
              {SUPPORTED_COUNTRIES.map((entry) => (
                <option key={entry.countryCode} value={entry.countryCode}>
                  {t(entry.label.fr, entry.label.en)} · {entry.currency}
                </option>
              ))}
            </select>
            <small>{t("Propose devise, fuseau et langue cohérents — modifiables ci-dessous.", "Proposes a coherent currency, time zone and language — editable below.")}</small>
          </label>
          <label className="field">
            <span>{t("Devise des loyers", "Rental currency")}</span>
            <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {RENTAL_CURRENCIES.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <small>{t("Librement changeable tant qu’aucune donnée financière n’existe.", "Freely changeable as long as no financial data exists.")}</small>
          </label>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>{t("Langue", "Language")}</span>
            <select name="language" value={language}
              onChange={(e) => setLanguage(e.target.value as "fr" | "en")}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="field">
            <span>{t("Fuseau horaire", "Time zone")}</span>
            <select name="timezone" required value={timezone}
              onChange={(e) => setTimezone(e.target.value)}>
              {ORGANIZATION_TIMEZONES.map(([id, label]) => (
                <option key={id} value={id}>{label[locale]} · {id}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>{t("Cycle d’abonnement", "Subscription cycle")}</span>
            <select required value={selectedCycle} onChange={(event) => {
              const value = event.target.value as BillingCycle | "";
              setSelectedCycle(value);
              void replaceIntent(value, selectedBillingCountry);
            }}>
              <option value="">{t("Choisir", "Choose")}</option>
              <option value="monthly">{t("Mensuel", "Monthly")}</option>
              <option value="annual">{t("Annuel", "Annual")}</option>
            </select>
          </label>
          <label className="field">
            <span>{t("Pays de facturation KJORA", "KJORA billing country")}</span>
            <select required value={selectedBillingCountry} onChange={(event) => {
              const value = event.target.value as BillingCountry | "";
              setSelectedBillingCountry(value);
              void replaceIntent(selectedCycle, value);
            }}>
              <option value="">{t("Choisir", "Choose")}</option>
              <option value="CA">Canada · CAD</option>
              <option value="CM">{t("Cameroun", "Cameroon")} · XAF</option>
              <option value="CI">{t("Côte d’Ivoire", "Ivory Coast")} · XOF</option>
            </select>
            <small>{t("Ce choix concerne uniquement l’abonnement KJORA.", "This choice applies only to the KJORA subscription.")}</small>
          </label>
        </div>
        <div className="fixed-configuration">
          <span><small>{t("Pays du marché locatif", "Rental market country")}</small><strong>{t(defaultsForCountry(country)?.label.fr ?? country, defaultsForCountry(country)?.label.en ?? country)}</strong></span>
          <span><small>{t("Devise des loyers", "Rental currency")}</small><strong>{currency}</strong></span>
          <span><small>{t("Devise d’abonnement", "Subscription currency")}</small><strong>{selectedBillingCountry ? subscriptionCurrencyForBillingCountry(selectedBillingCountry) : "—"}</strong></span>
        </div>
        <p className="auth-intro">{t(
          "La devise des loyers concerne vos locations. La devise d’abonnement concerne votre forfait KJORA. Elles ne sont jamais converties ou mélangées automatiquement.",
          "Rental currency applies to your properties. Subscription currency applies to your KJORA plan. They are never converted or mixed automatically.",
        )}</p>
        {!selectedBillingCountry && effectiveIntent === "decouverte" ? <p className="form-feedback" role="status">{t(
          "Découverte reste disponible gratuitement. Aucun tarif payant local n’est publié pour ce pays et aucun faux prix XAF ne sera affiché.",
          "Discovery remains available for free. No local paid price is published for this country, and no misleading XAF price will be shown.",
        )}</p> : null}
        {error && error !== "quota" ? (
          <p className="form-feedback form-feedback--error" role="alert">{error}</p>
        ) : null}
        <button className="button button--primary" disabled={busy || name.trim().length < 2 || !selectedCycle || (!selectedBillingCountry && effectiveIntent !== "decouverte")} type="submit">
          {busy ? t("Création…", "Creating…") : t("Créer mon espace", "Create my workspace")}
        </button>
      </form>
    );
  }

  // ─── Étape moyen d'encaissement ────────────────────────────────────────────
  if (step === "rent_method") {
    return (
      <div className="form-stack">
        <section aria-labelledby="owner-whatsapp-title">
          <h2 id="owner-whatsapp-title">{t("WhatsApp propriétaire (facultatif)", "Owner WhatsApp (optional)")}</h2>
          <PersonalWhatsAppPreferencesForm
            initial={{ ...initialWhatsAppPreferences, countryCode: initialWhatsAppPreferences.countryCode ?? country }}
            language={language}
            compact
          />
        </section>
        <form className="form-stack" onSubmit={submitRentMethod}>
        <label className="field">
          <span>{t("Comment recevez-vous actuellement vos loyers ?", "How do you currently collect rent?")}</span>
          <select name="rent_method" value={rentMethod}
            onChange={(e) => setRentMethod(e.target.value as RentCollectionMethod | "")}>
            <option value="">{t("Je préfère ne pas répondre", "I prefer not to answer")}</option>
            {RENT_COLLECTION_METHODS.map((m) => (
              <option key={m} value={m}>{locale === "en" ? RENT_COLLECTION_LABELS_EN[m] : RENT_COLLECTION_LABELS[m]}</option>
            ))}
          </select>
          <small>{t("Simple préférence de configuration. Aucun compte n’est connecté et aucun encaissement n’est automatisé.", "This is only a setup preference. No account is connected and no collection is automated.")}</small>
        </label>
        {error ? <p className="form-feedback form-feedback--error" role="alert">{error}</p> : null}
          <button className="button button--primary" disabled={busy} type="submit">{busy ? t("Enregistrement…", "Saving…") : t("Continuer ou ignorer WhatsApp", "Continue or skip WhatsApp")}</button>
        </form>
      </div>
    );
  }

  // ─── Étape premier bien ────────────────────────────────────────────────────
  if (step === "property") {
    return (
      <form className="form-stack" onSubmit={submitProperty}>
        <p className="auth-intro">{t("Ajoutons votre premier bien.", "Let’s add your first property.")}</p>
        <label className="field">
          <span>{t("Type de bien", "Property type")}</span>
          <select value={propertyType}
            onChange={(e) => setPropertyType(e.target.value as "house" | "building")}>
            <option value="house">{t("Maison entière", "Entire house")}</option>
            <option value="building">{t("Immeuble à plusieurs logements", "Multi-unit building")}</option>
          </select>
        </label>
        <label className="field">
          <span>{t("Nom du bien", "Property name")}</span>
          <input maxLength={120} minLength={2} required value={propertyName}
            onChange={(e) => setPropertyName(e.target.value)} placeholder={t("Ex. Résidence Pola", "E.g. Pola Residence")} />
        </label>
        <label className="field">
          <span>{t("Localité", "Location")}</span>
          <input maxLength={160} minLength={2} required value={propertyLocality}
            onChange={(e) => setPropertyLocality(e.target.value)} placeholder={t("Ex. Douala, Bonapriso", "E.g. Douala, Bonapriso")} />
        </label>
        {propertyType === "house" ? (
          <label className="field">
            <span>{t(`Loyer mensuel de référence (${currency}, facultatif)`, `Reference monthly rent (${currency}, optional)`)}</span>
            <input inputMode="numeric" value={referenceRent}
              onChange={(e) => setReferenceRent(e.target.value.replace(/\D/g, ""))} placeholder="150000" />
          </label>
        ) : null}
        {error ? <p className="form-feedback form-feedback--error" role="alert">{error}</p> : null}
        <div className="form-actions">
          <button className="button button--ghost" disabled={busy} onClick={skipToApp} type="button">
            {t("Plus tard", "Later")}
          </button>
          <button className="button button--primary" disabled={busy} type="submit">
            {busy ? t("Création…", "Creating…") : t("Ajouter ce bien", "Add this property")}
          </button>
        </div>
      </form>
    );
  }

  // ─── Étape premier logement ────────────────────────────────────────────────
  if (step === "unit") {
    return (
      <form className="form-stack" onSubmit={submitUnit}>
        <p className="auth-intro">{t("Ajoutons le premier logement de cet immeuble.", "Let’s add the first unit in this building.")}</p>
        <label className="field">
          <span>{t("Nom du logement", "Unit name")}</span>
          <input maxLength={120} minLength={1} required value={unitLabel}
            onChange={(e) => setUnitLabel(e.target.value)} placeholder={t("Ex. Appartement A1", "E.g. Apartment A1")} />
        </label>
        <label className="field">
          <span>{t(`Loyer mensuel de référence (${currency}, facultatif)`, `Reference monthly rent (${currency}, optional)`)}</span>
          <input inputMode="numeric" value={referenceRent}
            onChange={(e) => setReferenceRent(e.target.value.replace(/\D/g, ""))} placeholder="120000" />
        </label>
        {error ? <p className="form-feedback form-feedback--error" role="alert">{error}</p> : null}
        <div className="form-actions">
          <button className="button button--ghost" disabled={busy} onClick={skipToApp} type="button">
            {t("Plus tard", "Later")}
          </button>
          <button className="button button--primary" disabled={busy} type="submit">
            {busy ? t("Création…", "Creating…") : t("Terminer", "Finish")}
          </button>
        </div>
      </form>
    );
  }

  return null;
}
