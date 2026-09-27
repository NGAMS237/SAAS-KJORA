// =============================================================================
// KJORA — Modèle Billing SaaS (ALIGN-03)
// =============================================================================
// Domaine STRICTEMENT séparé des loyers.
//
//   • Loyer      : Locataire → Propriétaire   (modules payments / dues / ledger)
//   • Abonnement : Organization → VERALUZ SARL (ce domaine)
//   • KJORA Collect : futur, encore un autre domaine
//
// Aucun montant, aucune écriture de ce module ne touche Payment, Due, Ledger
// ni FinancialDocument. Le rapprochement entre les deux est interdit.
//
// `organization_plans` reste la vérité du plan EFFECTIF et des entitlements
// (ALIGN-01). Ce module porte le plan SOUSCRIT et l'état de l'abonnement ; il
// ne duplique jamais les entitlements et ne peut activer un plan payant sans
// confirmation de paiement vérifiée.
// =============================================================================

import { PLAN_QUOTA_TABLE, type PlanSlug } from "../entitlements/model.ts";

// ---------------------------------------------------------------------------
// États d'abonnement
// ---------------------------------------------------------------------------

export const SUBSCRIPTION_STATUSES = [
  /** Découverte : aucun provider, aucune carte, aucune facture obligatoire. */
  "free",
  /** Abonnement payant en cours, période courante réglée. */
  "active",
  /** Un prélèvement vient d'échouer, la période de grâce n'a pas encore démarré. */
  "payment_failed",
  /** Grâce de 7 jours : accès normal, avertissement affiché. */
  "grace",
  /** Grâce expirée sans règlement : application métier bloquée. */
  "billing_blocked",
  /** Annulation demandée, accès complet jusqu'à la fin de la période payée. */
  "cancellation_scheduled",
  /** Période payée terminée après annulation. */
  "cancelled",
  /** Retour d'un compte bloqué ou annulé, en attente de règlement du nouveau cycle. */
  "reactivation_pending",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === "string" && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

/** Transitions autorisées. Toute transition absente d'ici est un défaut. */
export const ALLOWED_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  free: ["active", "cancelled"],
  active: ["payment_failed", "cancellation_scheduled", "active", "cancelled"],
  payment_failed: ["grace", "active", "cancellation_scheduled"],
  grace: ["active", "billing_blocked", "cancellation_scheduled"],
  billing_blocked: ["reactivation_pending", "cancelled"],
  cancellation_scheduled: ["cancelled", "active"],
  cancelled: ["reactivation_pending", "free"],
  reactivation_pending: ["active", "billing_blocked", "cancelled"],
};

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** L'application métier est-elle bloquée en écriture ? */
export function isBillingBlocked(status: SubscriptionStatus): boolean {
  return status === "billing_blocked";
}

/** L'accès métier complet est-il maintenu ? */
export function hasFullAccess(status: SubscriptionStatus): boolean {
  return status === "free"
    || status === "active"
    || status === "payment_failed"
    || status === "grace"
    || status === "cancellation_scheduled";
}

/** Un avertissement de facturation doit-il être affiché ? */
export function needsBillingWarning(status: SubscriptionStatus): boolean {
  return status === "payment_failed" || status === "grace" || status === "reactivation_pending";
}

// ---------------------------------------------------------------------------
// Cycles et devises
// ---------------------------------------------------------------------------

export const BILLING_CYCLES = ["monthly", "annual"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export function isBillingCycle(value: unknown): value is BillingCycle {
  return typeof value === "string" && (BILLING_CYCLES as readonly string[]).includes(value);
}

/** Devises réellement validées. EUR et USD ne sont PAS canonisés : ne pas les inventer. */
export const BILLING_CURRENCIES = ["XAF", "CAD"] as const;
export type BillingCurrency = (typeof BILLING_CURRENCIES)[number];

export function isBillingCurrency(value: unknown): value is BillingCurrency {
  return typeof value === "string" && (BILLING_CURRENCIES as readonly string[]).includes(value);
}

/** Nombre de décimales de la devise : XAF n'en a pas, CAD en a deux. */
export const CURRENCY_DECIMALS: Record<BillingCurrency, number> = { XAF: 0, CAD: 2 };

/** Un montant est stocké en unité mineure : XAF entier, CAD centimes. */
export function toMinorUnits(amount: number, currency: BillingCurrency): number {
  return Math.round(amount * 10 ** CURRENCY_DECIMALS[currency]);
}

export function formatAmount(minor: number, currency: BillingCurrency): string {
  const decimals = CURRENCY_DECIMALS[currency];
  const value = minor / 10 ** decimals;
  const formatted = value.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${formatted} ${currency}`;
}

// ---------------------------------------------------------------------------
// Catalogue de prix — valeurs canoniques ALIGN-00, en unité mineure
// ---------------------------------------------------------------------------
// L'annuel applique la règle « 12 mois pour le prix de 10 ».
// `null` = pas de prix catalogue (Découverte gratuit, Sur mesure sur devis).

export type PriceEntry = { monthly: number | null; annual: number | null };

export const PRICE_CATALOG: Record<BillingCurrency, Record<PlanSlug, PriceEntry>> = {
  XAF: {
    decouverte: { monthly: 0, annual: 0 },
    essentiel: { monthly: 5_900, annual: 59_000 },
    avance: { monthly: 12_900, annual: 129_000 },
    patrimoine: { monthly: 24_900, annual: 249_000 },
    sur_mesure: { monthly: null, annual: null },
  },
  CAD: {
    decouverte: { monthly: 0, annual: 0 },
    essentiel: { monthly: 1_499, annual: 14_990 },
    avance: { monthly: 3_199, annual: 31_990 },
    patrimoine: { monthly: 6_199, annual: 61_990 },
    sur_mesure: { monthly: null, annual: null },
  },
};

export function priceFor(
  plan: PlanSlug,
  cycle: BillingCycle,
  currency: BillingCurrency,
): number | null {
  return PRICE_CATALOG[currency][plan][cycle];
}

/** Un plan est-il payant, donc soumis à confirmation de paiement ? */
export function isPaidPlan(plan: PlanSlug): boolean {
  return plan !== "decouverte";
}

/** Sur mesure ne passe jamais par le self-service : devis commercial. */
export function requiresQuote(plan: PlanSlug): boolean {
  return plan === "sur_mesure";
}

// ---------------------------------------------------------------------------
// Rang des plans — sert à distinguer upgrade et downgrade
// ---------------------------------------------------------------------------

const PLAN_RANK: Record<PlanSlug, number> = {
  decouverte: 0,
  essentiel: 1,
  avance: 2,
  patrimoine: 3,
  sur_mesure: 4,
};

export function planRank(plan: PlanSlug): number {
  return PLAN_RANK[plan];
}

export type PlanChangeDirection = "upgrade" | "downgrade" | "same";

export function planChangeDirection(from: PlanSlug, to: PlanSlug): PlanChangeDirection {
  if (planRank(to) > planRank(from)) return "upgrade";
  if (planRank(to) < planRank(from)) return "downgrade";
  return "same";
}

// ---------------------------------------------------------------------------
// Prorata d'upgrade — provider-agnostique
// ---------------------------------------------------------------------------
// Règle canonique : l'upgrade est immédiat après paiement, avec prorata sur le
// temps restant de la période courante.
//
//   crédit restant  = prix de l'ancien plan × jours restants / jours de période
//   coût restant    = prix du nouveau plan × jours restants / jours de période
//   montant dû      = max(0, coût restant − crédit restant)
//
// Aucun remboursement n'est produit : un solde négatif est ramené à zéro,
// conformément à « aucun remboursement automatique ».

export type ProrationQuote = {
  currency: BillingCurrency;
  cycle: BillingCycle;
  fromPlan: PlanSlug;
  toPlan: PlanSlug;
  daysInPeriod: number;
  daysRemaining: number;
  creditMinor: number;
  chargeMinor: number;
  amountDueMinor: number;
};

const MS_PER_DAY = 86_400_000;

/** Jours calendaires entre deux dates ISO (yyyy-mm-dd), bornes incluses côté début. */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / MS_PER_DAY);
}

export function computeProration(input: {
  fromPlan: PlanSlug;
  toPlan: PlanSlug;
  cycle: BillingCycle;
  currency: BillingCurrency;
  periodStart: string;
  periodEnd: string;
  onDate: string;
}): ProrationQuote | null {
  const { fromPlan, toPlan, cycle, currency, periodStart, periodEnd, onDate } = input;

  // Sur mesure relève d'un devis : aucun prorata automatique.
  if (requiresQuote(fromPlan) || requiresQuote(toPlan)) return null;

  const fromPrice = priceFor(fromPlan, cycle, currency);
  const toPrice = priceFor(toPlan, cycle, currency);
  if (fromPrice === null || toPrice === null) return null;

  const daysInPeriod = daysBetween(periodStart, periodEnd);
  if (daysInPeriod <= 0) return null;

  const rawRemaining = daysBetween(onDate, periodEnd);
  const daysRemaining = Math.min(Math.max(rawRemaining, 0), daysInPeriod);

  const creditMinor = Math.round((fromPrice * daysRemaining) / daysInPeriod);
  const chargeMinor = Math.round((toPrice * daysRemaining) / daysInPeriod);

  return {
    currency,
    cycle,
    fromPlan,
    toPlan,
    daysInPeriod,
    daysRemaining,
    creditMinor,
    chargeMinor,
    amountDueMinor: Math.max(0, chargeMinor - creditMinor),
  };
}

// ---------------------------------------------------------------------------
// Éligibilité au downgrade
// ---------------------------------------------------------------------------
// Un downgrade n'est autorisé que si l'usage actuel tient déjà dans les quotas
// du plan cible. Aucune donnée n'est jamais supprimée ni archivée pour
// « faire de la place ».

export type UsageSnapshot = {
  activeProperties: number;
  activeUnits: number;
  collaborators: number;
  organizations: number;
};

export type QuotaBlocker = {
  quota: "properties" | "active_units" | "collaborators" | "organizations";
  libelle: string;
  actuel: number;
  limite: number;
};

export type DowngradeEligibility =
  | { allowed: true }
  | { allowed: false; blockers: QuotaBlocker[] };

export function checkDowngradeEligibility(
  targetPlan: PlanSlug,
  usage: UsageSnapshot,
): DowngradeEligibility {
  // Sur mesure a des quotas négociés : hors self-service.
  if (targetPlan === "sur_mesure") return { allowed: true };

  const quotas = PLAN_QUOTA_TABLE[targetPlan];
  const blockers: QuotaBlocker[] = [];

  const controles: Array<[QuotaBlocker["quota"], string, number, number | null]> = [
    ["properties", "Biens", usage.activeProperties, quotas.maxProperties],
    ["active_units", "Logements actifs", usage.activeUnits, quotas.maxActiveUnits],
    ["collaborators", "Collaborateurs", usage.collaborators, quotas.maxCollaborators],
    ["organizations", "Organisations", usage.organizations, quotas.maxOrganizations],
  ];

  for (const [quota, libelle, actuel, limite] of controles) {
    if (limite !== null && actuel > limite) {
      blockers.push({ quota, libelle, actuel, limite });
    }
  }

  return blockers.length ? { allowed: false, blockers } : { allowed: true };
}

// ---------------------------------------------------------------------------
// Calendrier de relance après échec — préparé, jamais exécuté sans provider
// ---------------------------------------------------------------------------

/** Jours après l'échec initial où une nouvelle tentative est planifiée. */
export const RETRY_OFFSET_DAYS = [0, 1, 3, 6] as const;

/** Durée de la période de grâce, en jours. */
export const GRACE_PERIOD_DAYS = 7;

export function addDays(iso: string, days: number): string {
  const base = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(base)) return iso;
  return new Date(base + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function retrySchedule(failedOn: string): string[] {
  return RETRY_OFFSET_DAYS.map((offset) => addDays(failedOn, offset));
}

export function graceEndsOn(failedOn: string): string {
  return addDays(failedOn, GRACE_PERIOD_DAYS);
}

/** Rappels avant renouvellement : J-7, J-3, J-1. */
export const RENEWAL_REMINDER_OFFSETS = [7, 3, 1] as const;

export function renewalReminderDates(renewalOn: string): string[] {
  return RENEWAL_REMINDER_OFFSETS.map((offset) => addDays(renewalOn, -offset));
}

/** Relances pendant la tolérance : J+1, J+3, J+6 après le début de la grâce (REVENUE-01C). */
export const GRACE_REMINDER_OFFSETS = [1, 3, 6] as const;

export function graceReminderDates(graceStartedOn: string): string[] {
  return GRACE_REMINDER_OFFSETS.map((offset) => addDays(graceStartedOn, offset));
}

/**
 * Expiration du moyen de paiement : J-30, J-7 (REVENUE-01C, ALIGN-00 §6.2).
 * Ne produit un rappel que si le provider expose cette information — aucun
 * n'est branché aujourd'hui, donc cette liste ne trouve encore aucun candidat.
 */
export const PAYMENT_METHOD_EXPIRY_OFFSETS = [30, 7] as const;

/**
 * Seuil « facture Afrique arrivant à échéance » : J-3 avant l'échéance de
 * paiement (`billing_invoices.due_on`, repli sur la fin de période pour une
 * facture antérieure à REVENUE-01B).
 */
export const INVOICE_DUE_SOON_OFFSET_DAYS = 3;

/**
 * Délai de paiement par défaut d'une facture manuelle (REVENUE-01B) : 7 jours
 * après le début de période (ou après la date d'émission si la période a déjà
 * commencé), borné à la fin de période. Miroir exact de
 * `admin_issue_manual_invoice` (SQL).
 */
export const MANUAL_INVOICE_PAYMENT_TERM_DAYS = 7;

/** Échéance par défaut d'une facture manuelle — même règle que le SQL. */
export function defaultManualInvoiceDueOn(periodStart: string, periodEnd: string, today: string): string {
  const start = periodStart > today ? periodStart : today;
  const candidate = addDays(start, MANUAL_INVOICE_PAYMENT_TERM_DAYS);
  return candidate < periodEnd ? candidate : periodEnd;
}

// ---------------------------------------------------------------------------
// Factures
// ---------------------------------------------------------------------------

export const INVOICE_STATUSES = ["draft", "open", "paid", "void", "uncollectible"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export function isInvoiceStatus(value: unknown): value is InvoiceStatus {
  return typeof value === "string" && (INVOICE_STATUSES as readonly string[]).includes(value);
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Brouillon",
  open: "À régler",
  paid: "Réglée",
  void: "Annulée",
  uncollectible: "Irrécouvrable",
};

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  free: "Découverte",
  active: "Actif",
  payment_failed: "Paiement refusé",
  grace: "Période de tolérance",
  billing_blocked: "Compte bloqué",
  cancellation_scheduled: "Annulation programmée",
  cancelled: "Annulé",
  reactivation_pending: "Réactivation en attente",
};

/** Message destiné à l'utilisateur : simple, jamais technique. */
export const SUBSCRIPTION_STATUS_MESSAGES: Record<SubscriptionStatus, string> = {
  free: "Vous utilisez Découverte, gratuitement. Aucun moyen de paiement n’est demandé.",
  active: "Votre abonnement est actif.",
  payment_failed: "Le dernier paiement n’a pas abouti. Vous gardez l’accès complet pendant que nous réessayons.",
  grace: "Votre paiement est en attente. Vous gardez l’accès complet, mais il sera suspendu si rien n’est réglé d’ici la fin de la tolérance.",
  billing_blocked: "Votre compte est suspendu faute de règlement. Vos données sont intactes : réglez votre abonnement pour retrouver l’accès.",
  cancellation_scheduled: "Votre abonnement prendra fin à l’échéance. Vous gardez l’accès complet jusque-là.",
  cancelled: "Votre abonnement est terminé. Vos données restent conservées le temps prévu par nos conditions.",
  reactivation_pending: "Votre réactivation est en cours. Elle démarre un nouveau cycle, sans rattrapage des mois suspendus.",
};

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: "Mensuel",
  annual: "Annuel",
};

// ---------------------------------------------------------------------------
// Facturation manuelle Afrique (REVENUE-01B)
// ---------------------------------------------------------------------------
// Portée verrouillée : la confirmation manuelle de paiement ne concerne que la
// devise XAF (Cameroun/Afrique). Le Canada/diaspora reste sur l'architecture
// Stripe préparée (REVENUE-01F) — décision produit verrouillée, non rouverte
// par ce module.

export const MANUAL_INVOICING_CURRENCY: BillingCurrency = "XAF";

export function supportsManualInvoicing(currency: BillingCurrency): boolean {
  return currency === MANUAL_INVOICING_CURRENCY;
}

/**
 * Un reçu (preuve de paiement) n'a de sens qu'une fois la facture réglée.
 * Avant paiement, seule une facture (demande de règlement) peut être montrée.
 */
export function isReceiptAvailable(status: InvoiceStatus): boolean {
  return status === "paid";
}

/** Une facture en statut 'open' est-elle en retard sur son échéance ? Calculé, jamais stocké. */
export function isInvoiceOverdue(status: InvoiceStatus, periodEnd: string, onDate: string): boolean {
  return status === "open" && Date.parse(`${periodEnd}T00:00:00Z`) < Date.parse(`${onDate}T00:00:00Z`);
}
