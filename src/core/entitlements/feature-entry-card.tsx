"use client";

// FEATURE GATING UX — carte d'entrée Paramètres pour une fonctionnalité
// potentiellement verrouillée par le plan (§14, §19). Remplace le motif
// précédent ("Configurer" devient un Link direct vers /app/billing quand
// l'entitlement manque) par un clic qui reste sur la page et ouvre
// FeatureUpgradeModal — la navigation vers /app/billing ne se produit
// qu'après un choix explicite dans le modal (§18).

import { useState } from "react";
import { Lock } from "lucide-react";
import Link from "next/link";
import { FeatureUpgradeModal } from "@/core/entitlements/feature-upgrade-modal";
import { PLAN_LABELS, type PlanFeature, type PlanSlug } from "@/core/entitlements/model";

export function FeatureEntryCard({
  eyebrow,
  title,
  description,
  href,
  ctaLabel,
  entitled,
  currentPlan,
  minimumPlan,
  feature,
  modalTitle,
  modalMessage,
}: {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  entitled: boolean;
  currentPlan: PlanSlug;
  minimumPlan: PlanSlug;
  feature: PlanFeature | string;
  modalTitle: string;
  modalMessage: string;
}) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const minimumPlanLabel = PLAN_LABELS[minimumPlan].fr;
  return (
    <div className="settings-card settings-card--feature">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {entitled ? (
          <Link className="button button--secondary" href={href}>{ctaLabel}</Link>
        ) : (
          <button className="button button--secondary" onClick={() => setShowUpgrade(true)} type="button">
            <Lock size={14} aria-hidden="true" />{ctaLabel}
          </button>
        )}
      </div>
      {!entitled ? <p className="demo-hint">Disponible à partir de l’offre {minimumPlanLabel}.</p> : null}
      {showUpgrade ? (
        <FeatureUpgradeModal
          currentPlan={currentPlan}
          feature={feature}
          message={modalMessage}
          minimumPlan={minimumPlan}
          onClose={() => setShowUpgrade(false)}
          title={modalTitle}
        />
      ) : null}
    </div>
  );
}
