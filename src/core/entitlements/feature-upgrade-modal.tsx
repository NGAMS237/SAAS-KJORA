"use client";

// =============================================================================
// KJORA — FeatureUpgradeModal (FEATURE GATING UX)
// =============================================================================
// Distinct de `QuotaLimitModal` (§16 : ne pas mélanger quota et feature) —
// celui-ci est déclenché PROACTIVEMENT côté client, avant tout appel serveur,
// au moment où l'utilisateur clique sur une fonctionnalité qu'on sait déjà
// non incluse dans son offre (l'entitlement a déjà été vérifié côté serveur
// au chargement de la page, comme c'était déjà le cas avant ce lot). Il ne
// remplace jamais la vérification serveur qui reste la barrière réelle.
//
// Comportement (§13) : l'utilisateur reste sur la page actuelle, aucun
// changement d'onglet automatique, aucun redirect immédiat vers /app/billing
// — "Voir les offres" n'y mène qu'après un clic volontaire, "Continuer ici"
// ferme simplement le modal sans naviguer.
// =============================================================================

import Link from "next/link";
import { X } from "lucide-react";
import { PLAN_LABELS, type PlanFeature, type PlanSlug } from "@/core/entitlements/model";

export type FeatureUpgradeModalProps = {
  /** Identifiant de la fonctionnalité verrouillée (pour analytics/tests, jamais affiché tel quel). */
  feature: PlanFeature | string;
  /** Plan actuel de l'Organization. */
  currentPlan: PlanSlug;
  /** Plan minimum qui inclut la fonctionnalité. */
  minimumPlan: PlanSlug;
  /** Titre affiché — un message clair et spécifique à la fonctionnalité (§14). */
  title: string;
  /** Message principal — doit rester rassurant sur l'intégrité des données. */
  message: string;
  language?: "FR" | "EN";
  onClose: () => void;
};

export function FeatureUpgradeModal({
  currentPlan,
  minimumPlan,
  title,
  message,
  language = "FR",
  onClose,
}: FeatureUpgradeModalProps) {
  const minimumPlanLabel = PLAN_LABELS[minimumPlan][language === "FR" ? "fr" : "en"];
  const currentPlanLabel = PLAN_LABELS[currentPlan][language === "FR" ? "fr" : "en"];
  return (
    <div className="confirmation-modal" role="presentation">
      <button
        aria-label={language === "FR" ? "Fermer" : "Close"}
        className="confirmation-modal__backdrop"
        onClick={onClose}
        type="button"
      />
      <section aria-labelledby="feature-upgrade-title" aria-modal="true" className="confirmation-modal__panel" role="dialog">
        <div className="confirmation-modal__header">
          <div>
            <p className="eyebrow">{language === "FR" ? `Offre ${currentPlanLabel}` : `${currentPlanLabel} plan`}</p>
            <h2 id="feature-upgrade-title">{title}</h2>
          </div>
          <button aria-label={language === "FR" ? "Fermer" : "Close"} className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <p>{message}</p>
        <p className="demo-hint">
          {language === "FR" ? "Aucune de vos données n’est modifiée." : "None of your data is changed."}
        </p>
        <div className="demo-form-actions">
          <button className="button button--secondary" onClick={onClose} type="button">
            {language === "FR" ? "Continuer ici" : "Stay here"}
          </button>
          <Link className="button button--primary" href="/app/billing">
            {language === "FR" ? `Voir les offres (à partir de ${minimumPlanLabel})` : `View plans (from ${minimumPlanLabel})`}
          </Link>
        </div>
      </section>
    </div>
  );
}
