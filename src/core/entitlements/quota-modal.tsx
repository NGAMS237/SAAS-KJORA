"use client";

// =============================================================================
// KJORA — Quota limit modal (UX stabilization gate, section 2)
// Turns a structured EntitlementError (from entitlementErrorResponse on the
// server) into a plain-language modal. No internal codes, no HTTP status,
// no "PLAN_*" strings ever reach this component's rendered output.
// =============================================================================

import Link from "next/link";
import { X } from "lucide-react";
import { PLAN_LABELS, type EntitlementError, type EntitlementErrorCode } from "@/core/entitlements/model";

/**
 * Parses a fetch Response body (already JSON-decoded) shaped like
 * entitlementErrorResponse()'s payload back into an EntitlementError.
 * Returns null if the body doesn't look like an entitlement error, so
 * callers can fall back to their existing generic error handling.
 */
export function entitlementErrorFromBody(body: unknown): EntitlementError | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const code = record.error;
  const knownCodes: EntitlementErrorCode[] = [
    "PLAN_PROPERTY_LIMIT_REACHED",
    "PLAN_ACTIVE_UNIT_LIMIT_REACHED",
    "PLAN_COLLABORATOR_LIMIT_REACHED",
    "PLAN_ORGANIZATION_LIMIT_REACHED",
    "PLAN_FEATURE_NOT_AVAILABLE",
  ];
  if (typeof code !== "string" || !knownCodes.includes(code as EntitlementErrorCode)) return null;
  return {
    code: code as EntitlementErrorCode,
    plan: typeof record.plan === "string" ? (record.plan as EntitlementError["plan"]) : "decouverte",
    quota: typeof record.quota === "number" ? record.quota : null,
    current: typeof record.current === "number" ? record.current : 0,
    suggestedUpgrade:
      typeof record.suggestedUpgrade === "string"
        ? (record.suggestedUpgrade as EntitlementError["suggestedUpgrade"])
        : undefined,
  };
}

type Copy = { fr: string; en: string };

function quotaNounFor(code: EntitlementErrorCode): Copy | null {
  switch (code) {
    case "PLAN_PROPERTY_LIMIT_REACHED":
      return { fr: "biens", en: "properties" };
    case "PLAN_ACTIVE_UNIT_LIMIT_REACHED":
      return { fr: "logements actifs", en: "active units" };
    case "PLAN_COLLABORATOR_LIMIT_REACHED":
      return { fr: "collaborateurs", en: "collaborators" };
    case "PLAN_ORGANIZATION_LIMIT_REACHED":
      return { fr: "organisations", en: "organizations" };
    default:
      return null;
  }
}

function messageFor(error: EntitlementError, language: "FR" | "EN"): { title: string; body: string } {
  const planLabel = PLAN_LABELS[error.plan][language === "FR" ? "fr" : "en"];
  const noun = quotaNounFor(error.code);

  if (noun && error.quota !== null) {
    const count = `${error.quota} ${noun[language === "FR" ? "fr" : "en"]}`;
    return language === "FR"
      ? {
          title: "Limite de votre offre atteinte",
          body: `Votre offre ${planLabel} autorise jusqu’à ${count}. Vous avez déjà atteint cette limite. Aucune donnée n’est supprimée, mais cette action est bloquée tant que votre offre n’est pas adaptée.`,
        }
      : {
          title: "Your plan's limit has been reached",
          body: `Your ${planLabel} plan allows up to ${count}. You've already reached this limit. No data is deleted, but this action is blocked until your plan is adjusted.`,
        };
  }

  // PLAN_FEATURE_NOT_AVAILABLE (e.g. contracts, custom templates) or a
  // quota code with no numeric ceiling to quote — describe the plan gate
  // itself rather than a count.
  const upgradeLabel = error.suggestedUpgrade ? PLAN_LABELS[error.suggestedUpgrade][language === "FR" ? "fr" : "en"] : null;
  return language === "FR"
    ? {
        title: "Fonctionnalité non incluse dans votre offre",
        body: upgradeLabel
          ? `Votre offre ${planLabel} n’inclut pas cette fonctionnalité. Elle est disponible à partir de l’offre ${upgradeLabel}. Aucune donnée n’est perdue, mais cette action reste indisponible tant que votre offre n’est pas adaptée.`
          : `Votre offre ${planLabel} n’inclut pas cette fonctionnalité. Aucune donnée n’est perdue, mais cette action reste indisponible tant que votre offre n’est pas adaptée.`,
      }
    : {
        title: "This feature isn't included in your plan",
        body: upgradeLabel
          ? `Your ${planLabel} plan doesn't include this feature. It's available from the ${upgradeLabel} plan onward. No data is lost, but this action stays unavailable until your plan is adjusted.`
          : `Your ${planLabel} plan doesn't include this feature. No data is lost, but this action stays unavailable until your plan is adjusted.`,
      };
}

export function QuotaLimitModal({
  error,
  language,
  onClose,
}: {
  error: EntitlementError;
  language: "FR" | "EN";
  onClose: () => void;
}) {
  const { title, body } = messageFor(error, language);
  return (
    <div className="confirmation-modal" role="presentation">
      <button
        aria-label={language === "FR" ? "Fermer" : "Close"}
        className="confirmation-modal__backdrop"
        onClick={onClose}
        type="button"
      />
      <section aria-labelledby="quota-limit-title" aria-modal="true" className="confirmation-modal__panel" role="dialog">
        <div className="confirmation-modal__header">
          <div>
            <p className="eyebrow">{language === "FR" ? "Offre" : "Plan"}</p>
            <h2 id="quota-limit-title">{title}</h2>
          </div>
          <button aria-label={language === "FR" ? "Fermer" : "Close"} className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <p>{body}</p>
        <div className="demo-form-actions">
          <button className="button button--secondary" onClick={onClose} type="button">
            {language === "FR" ? "Fermer" : "Close"}
          </button>
          <Link className="button button--primary" href="/app/billing">
            {language === "FR" ? "Voir les offres" : "View plans"}
          </Link>
        </div>
      </section>
    </div>
  );
}
