// =============================================================================
// KJORA — ADMIN-01 — États du tableau de suivi
// =============================================================================
// Module PUR : aucune entrée-sortie, aucun accès base, aucun `server-only`.
// Testable sans environnement ni réseau.
//
// Règle centrale (ADMIN-01 §4) : ne JAMAIS présenter un service comme sain
// faute de données. L'état `normal` n'est atteignable que si une source fiable
// est intégrée ET qu'elle a répondu. Toute autre situation produit un état qui
// dit explicitement ce qui manque.
// =============================================================================

/** États possibles d'un indicateur. */
export const MONITORING_STATES = [
  /** Source intégrée, réponse récente, aucune anomalie. */
  "normal",
  /** Anomalies réellement constatées dans les données. */
  "incident",
  /** Source intégrée, mais la donnée la plus récente est trop ancienne. */
  "stale",
  /** Source intégrée, mais la lecture a échoué. */
  "unavailable",
  /** Aucune source fiable intégrée. Ni sain, ni en panne : inconnu. */
  "not_connected",
] as const;

export type MonitoringState = (typeof MONITORING_STATES)[number];

/** Un indicateur affiché dans le tableau de suivi. */
export type MonitoringIndicator = {
  /** Clé stable, utilisée pour les libellés bilingues. */
  key: string;
  state: MonitoringState;
  /** Horodatage de la donnée la plus récente, si la source en fournit une. */
  observedAt: string | null;
  /**
   * Origine réelle de l'indicateur, affichée dans l'interface et reprise dans
   * le rapport. Rend vérifiable ce qui est mesuré et ce qui ne l'est pas.
   */
  source: string;
  /** Détail chiffré éventuel (nombre d'anomalies…). */
  detail?: string;
};

/** Au-delà de ce délai, une donnée est considérée comme ancienne. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Entrée d'une sonde dont la source EST intégrée.
 *
 * `ok: false` signale un échec de lecture, pas une absence de données :
 * les deux ne produisent pas le même état.
 */
export type ProbeResult =
  | { ok: false }
  | { ok: true; latest: Date | null; anomalies?: number };

/**
 * Dérive l'état d'un indicateur adossé à une source réellement intégrée.
 *
 * Ordre d'évaluation délibéré : un échec de lecture prime sur tout, puis les
 * anomalies, puis l'ancienneté. Une source qui a répondu sans jamais rien
 * produire reste `not_connected` — nous n'avons observé aucun fonctionnement.
 */
export function deriveState(probe: ProbeResult, now: Date): MonitoringState {
  if (!probe.ok) return "unavailable";
  if ((probe.anomalies ?? 0) > 0) return "incident";
  if (probe.latest === null) return "not_connected";
  const age = now.getTime() - probe.latest.getTime();
  if (age > STALE_AFTER_MS) return "stale";
  return "normal";
}

/**
 * Construit l'indicateur d'un service NON intégré.
 *
 * Toujours `not_connected`, quelles que soient les circonstances : sans source,
 * nous ne savons rien. Afficher « sain » serait une affirmation sans preuve.
 */
export function notConnectedIndicator(key: string, source: string): MonitoringIndicator {
  return { key, state: "not_connected", observedAt: null, source };
}

/**
 * Services dont aucune source fiable n'est intégrée à ce stade.
 *
 * Aucune sonde HTTP n'est effectuée vers ces services : une requête réussie
 * vers une page de statut ne prouverait rien sur l'état de NOTRE projet, et
 * nous n'ajoutons aucun service payant ni aucune dépendance réseau.
 *
 * Ces entrées passeront à une sonde réelle quand une source vérifiable sera
 * disponible — jamais avant.
 */
export const UNMONITORED_SERVICES: readonly { key: string; source: string }[] = [
  { key: "supabase", source: "aucune source intégrée" },
  { key: "vercel", source: "aucune source intégrée" },
  { key: "resend", source: "aucune source intégrée" },
  { key: "payments", source: "aucun fournisseur raccordé (ALIGN-04)" },
  // ADMIN-01.1 : ajoutés à la demande de la vue d'ensemble. Même règle que les
  // quatre services ci-dessus — aucun fournisseur Stripe/paiement n'est
  // raccordé, et aucune source fiable de demandes de support n'existe encore
  // (le formulaire support envoie un email, sans persistance interrogeable —
  // voir src/core/support/support-email.ts). « Non connecté », jamais déduit.
  { key: "revenue", source: "aucun fournisseur de paiement raccordé (ALIGN-04)" },
  { key: "support_requests", source: "aucune persistance interrogeable (email sortant uniquement)" },
] as const;

/**
 * Vrai si l'indicateur affirme que quelque chose fonctionne.
 *
 * Sert de garde-fou dans les tests : aucun service non intégré ne doit jamais
 * produire un état affirmatif.
 */
export function assertsHealthy(state: MonitoringState): boolean {
  return state === "normal";
}

/**
 * Libellés bilingues des états.
 *
 * ADMIN-01.1 : cinq libellés harmonisés dans toute la console (en-tête compris) —
 * Normal / Attention / Données anciennes / Non connecté / Erreur. Les clés
 * internes (`incident`, `unavailable`…) et la logique de dérivation dans
 * `deriveState` ne changent pas : seul l'habillage textuel est aligné sur le
 * vocabulaire demandé pour ADMIN-01.1.
 */
export const STATE_LABELS: Record<MonitoringState, { fr: string; en: string }> = {
  normal: { fr: "Normal", en: "Normal" },
  incident: { fr: "Attention", en: "Attention" },
  stale: { fr: "Données anciennes", en: "Stale data" },
  unavailable: { fr: "Erreur", en: "Error" },
  not_connected: { fr: "Non connecté", en: "Not connected" },
};

/** Libellés bilingues des indicateurs. */
export const INDICATOR_LABELS: Record<string, { fr: string; en: string }> = {
  app_events: { fr: "Événements applicatifs", en: "Application events" },
  organizations: { fr: "Organizations", en: "Organizations" },
  subscriptions: { fr: "Abonnements", en: "Subscriptions" },
  supabase: { fr: "Supabase", en: "Supabase" },
  vercel: { fr: "Vercel", en: "Vercel" },
  resend: { fr: "Resend", en: "Resend" },
  payments: { fr: "Paiements", en: "Payments" },
  revenue: { fr: "Revenus", en: "Revenue" },
  support_requests: { fr: "Demandes de support", en: "Support requests" },
  plan_billing_mismatch: { fr: "Incohérences forfait/facturation", en: "Plan/billing mismatches" },
};
