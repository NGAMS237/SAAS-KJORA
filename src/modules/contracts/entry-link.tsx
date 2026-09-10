"use client";

// FEATURE GATING UX (§19) — CTA contrat depuis la fiche Location. Avant ce
// lot, l'absence d'entitlement masquait entièrement le bouton (aucun indice
// que la fonctionnalité existe). Il reste maintenant visible avec un
// indicateur premium discret, et un clic ouvre FeatureUpgradeModal sur place
// au lieu de rien afficher.

import { useState } from "react";
import Link from "next/link";
import { FeatureUpgradeModal } from "@/core/entitlements/feature-upgrade-modal";
import { PremiumBadge } from "@/core/entitlements/premium-badge";
import type { PlanSlug } from "@/core/entitlements/model";

export function ContractEntryLink({ leaseId, entitled, currentPlan }: { leaseId: string; entitled: boolean; currentPlan: PlanSlug }) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  if (entitled) {
    return (
      <div className="lease-contract-entry">
        <Link className="button button--secondary" href={`/app/locations/${leaseId}/contrat`}>Générer ou consulter le contrat</Link>
        <small>Facultatif · le bail n’est jamais bloqué par ce document.</small>
      </div>
    );
  }
  return (
    <div className="lease-contract-entry">
      <button className="button button--secondary" onClick={() => setShowUpgrade(true)} type="button">
        Générer ou consulter le contrat <PremiumBadge minimumPlan="essentiel" />
      </button>
      <small>Facultatif · le bail n’est jamais bloqué par ce document.</small>
      {showUpgrade ? (
        <FeatureUpgradeModal
          currentPlan={currentPlan}
          feature="contracts"
          message="Votre offre Découverte ne comprend pas encore la création et la signature de contrats. Cette fonctionnalité est disponible à partir de l’offre Essentiel."
          minimumPlan="essentiel"
          onClose={() => setShowUpgrade(false)}
          title="Les contrats ne sont pas inclus dans votre offre"
        />
      ) : null}
    </div>
  );
}
