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
import { trackEvent } from "@/core/analytics/events";
import { needsIntentPreservation, planLabel } from "@/core/onboarding/plan-intent";
import {
  RENT_COLLECTION_LABELS,
  RENT_COLLECTION_METHODS,
  type OnboardingState,
  type OnboardingStep,
  type RentCollectionMethod,
} from "@/core/onboarding/onboarding-state";
import type { PlanSlug } from "@/core/entitlements/model";

type QuotaError = { quota: number | null; current: number };

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
  isNewOrgRequest = false,
}: {
  initialState: OnboardingState;
  planRequested?: PlanSlug | null;
  isNewOrgRequest?: boolean;
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
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [timezone, setTimezone] = useState("Africa/Douala");
  const [rentMethod, setRentMethod] = useState<RentCollectionMethod | "">(
    initialState.rentCollectionMethod ?? "",
  );
  const [propertyName, setPropertyName] = useState("");
  const [propertyLocality, setPropertyLocality] = useState("");
  const [referenceRent, setReferenceRent] = useState("");
  const [unitLabel, setUnitLabel] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState<QuotaError | null>(null);

  // Verrou anti-double-submit côté client, en complément de l'idempotence serveur
  const inFlight = useRef(false);

  const effectiveIntent = initialState.planIntent ?? planRequested;

  useEffect(() => {
    trackEvent("onboarding_started", {
      plan_intent: effectiveIntent,
      resumed: initialState.exists && initialState.step !== "plan_intent",
    });
    // Enregistre l'intention de plan sans jamais activer de plan payant
    if (planRequested && !initialState.planIntent) {
      trackEvent("plan_intent_received", { plan_intent: planRequested, activated: false });
      void patchOnboarding({ plan_intent: planRequested });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Idempotence : une Organization déjà créée n'est jamais recréée
      if (organizationId) {
        setStep("rent_method");
        return;
      }

      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), language, timezone }),
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
        setError("Impossible de créer l'organisation. Vérifiez les informations et réessayez.");
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
        setError("Impossible de créer ce bien. Vérifiez les informations et réessayez.");
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
        setError("Impossible de créer ce logement. Vérifiez les informations et réessayez.");
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
    router.replace("/app");
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
          Votre plan actuel n&apos;autorise pas d&apos;organisation supplémentaire
          {quotaError.quota != null ? ` (limite : ${quotaError.quota}, actuel : ${quotaError.current})` : ""}.
        </p>
        <p className="auth-intro">
          Aucune organisation existante n&apos;est modifiée. Un plan supérieur est nécessaire pour en ajouter une.
        </p>
        <a className="button button--primary" href="/app">Retour à mon espace</a>
      </div>
    );
  }

  // ─── Étape Organization ────────────────────────────────────────────────────
  if (step === "plan_intent" || step === "organization" || !organizationId) {
    return (
      <form className="form-stack" onSubmit={submitOrganization}>
        {needsIntentPreservation(effectiveIntent) ? (
          <p className="onboarding-plan-note">
            Plan visé : <strong>{planLabel(effectiveIntent)}</strong> · Démarrage sur Découverte, sans paiement.
          </p>
        ) : null}
        <label className="field">
          <span>Nom de l&apos;organisation</span>
          <input
            autoFocus maxLength={120} minLength={2} name="name" required
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Horizon Habitat" value={name}
          />
        </label>
        <div className="form-grid">
          <label className="field">
            <span>Langue</span>
            <select name="language" value={language}
              onChange={(e) => setLanguage(e.target.value as "fr" | "en")}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="field">
            <span>Fuseau horaire</span>
            <select name="timezone" required value={timezone}
              onChange={(e) => setTimezone(e.target.value)}>
              {ORGANIZATION_TIMEZONES.map(([id, label]) => (
                <option key={id} value={id}>{label} · {id}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="fixed-configuration">
          <span><small>Pays</small><strong>Cameroun</strong></span>
          <span><small>Devise</small><strong>XAF</strong></span>
          <span><small>Plan</small><strong>Découverte · gratuit</strong></span>
        </div>
        {error && error !== "quota" ? (
          <p className="form-feedback form-feedback--error" role="alert">{error}</p>
        ) : null}
        <button className="button button--primary" disabled={busy || name.trim().length < 2} type="submit">
          {busy ? "Création…" : "Créer mon espace"}
        </button>
      </form>
    );
  }

  // ─── Étape moyen d'encaissement ────────────────────────────────────────────
  if (step === "rent_method") {
    return (
      <form className="form-stack" onSubmit={submitRentMethod}>
        <label className="field">
          <span>Comment recevez-vous actuellement vos loyers ?</span>
          <select name="rent_method" value={rentMethod}
            onChange={(e) => setRentMethod(e.target.value as RentCollectionMethod | "")}>
            <option value="">Je préfère ne pas répondre</option>
            {RENT_COLLECTION_METHODS.map((m) => (
              <option key={m} value={m}>{RENT_COLLECTION_LABELS[m]}</option>
            ))}
          </select>
          <small>Simple préférence de configuration. Aucun compte n&apos;est connecté et aucun encaissement n&apos;est automatisé.</small>
        </label>
        {error ? <p className="form-feedback form-feedback--error" role="alert">{error}</p> : null}
        <button className="button button--primary" disabled={busy} type="submit">Continuer</button>
      </form>
    );
  }

  // ─── Étape premier bien ────────────────────────────────────────────────────
  if (step === "property") {
    return (
      <form className="form-stack" onSubmit={submitProperty}>
        <p className="auth-intro">Ajoutons votre premier bien.</p>
        <label className="field">
          <span>Type de bien</span>
          <select value={propertyType}
            onChange={(e) => setPropertyType(e.target.value as "house" | "building")}>
            <option value="house">Maison entière</option>
            <option value="building">Immeuble à plusieurs logements</option>
          </select>
        </label>
        <label className="field">
          <span>Nom du bien</span>
          <input maxLength={120} minLength={2} required value={propertyName}
            onChange={(e) => setPropertyName(e.target.value)} placeholder="Ex. Résidence Pola" />
        </label>
        <label className="field">
          <span>Localité</span>
          <input maxLength={160} minLength={2} required value={propertyLocality}
            onChange={(e) => setPropertyLocality(e.target.value)} placeholder="Ex. Douala, Bonapriso" />
        </label>
        {propertyType === "house" ? (
          <label className="field">
            <span>Loyer mensuel de référence (XAF, facultatif)</span>
            <input inputMode="numeric" value={referenceRent}
              onChange={(e) => setReferenceRent(e.target.value.replace(/\D/g, ""))} placeholder="150000" />
          </label>
        ) : null}
        {error ? <p className="form-feedback form-feedback--error" role="alert">{error}</p> : null}
        <div className="form-actions">
          <button className="button button--ghost" disabled={busy} onClick={skipToApp} type="button">
            Plus tard
          </button>
          <button className="button button--primary" disabled={busy} type="submit">
            {busy ? "Création…" : "Ajouter ce bien"}
          </button>
        </div>
      </form>
    );
  }

  // ─── Étape premier logement ────────────────────────────────────────────────
  if (step === "unit") {
    return (
      <form className="form-stack" onSubmit={submitUnit}>
        <p className="auth-intro">Ajoutons le premier logement de cet immeuble.</p>
        <label className="field">
          <span>Nom du logement</span>
          <input maxLength={120} minLength={1} required value={unitLabel}
            onChange={(e) => setUnitLabel(e.target.value)} placeholder="Ex. Appartement A1" />
        </label>
        <label className="field">
          <span>Loyer mensuel de référence (XAF, facultatif)</span>
          <input inputMode="numeric" value={referenceRent}
            onChange={(e) => setReferenceRent(e.target.value.replace(/\D/g, ""))} placeholder="120000" />
        </label>
        {error ? <p className="form-feedback form-feedback--error" role="alert">{error}</p> : null}
        <div className="form-actions">
          <button className="button button--ghost" disabled={busy} onClick={skipToApp} type="button">
            Plus tard
          </button>
          <button className="button button--primary" disabled={busy} type="submit">
            {busy ? "Création…" : "Terminer"}
          </button>
        </div>
      </form>
    );
  }

  return null;
}
