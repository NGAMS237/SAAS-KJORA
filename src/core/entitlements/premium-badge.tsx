// KJORA — indicateur premium discret (§17).
//
// Affiché AVANT le clic, pour que l'utilisateur comprenne qu'une fonction
// est premium sans avoir à essayer d'abord. Volontairement sobre : un petit
// cadenas + le nom du plan minimum, jamais un badge criard ou une bannière.

import { Lock } from "lucide-react";
import { PLAN_LABELS, type PlanSlug } from "@/core/entitlements/model";

export function PremiumBadge({ minimumPlan, language = "FR" }: { minimumPlan: PlanSlug; language?: "FR" | "EN" }) {
  const label = PLAN_LABELS[minimumPlan][language === "FR" ? "fr" : "en"];
  return (
    <span className="premium-badge" title={language === "FR" ? `Disponible à partir de l’offre ${label}` : `Available from the ${label} plan`}>
      <Lock size={12} aria-hidden="true" />
      {label}
    </span>
  );
}
