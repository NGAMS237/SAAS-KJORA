// =============================================================================
// KJORA — Messages FR/EN des résultats de la facturation manuelle (REVENUE-01B, v3)
// =============================================================================
// Point UNIQUE de correspondance entre les codes `outcome` renvoyés par
// admin_issue_manual_invoice / admin_confirm_manual_invoice_payment (SQL) et
// un message lisible, bilingue. Tout code inconnu (nouvelle valeur SQL pas
// encore traduite, réponse inattendue) retombe sur un message générique SÛR :
// jamais le code brut, jamais un détail technique.
//
// Module PUR (aucun accès base, aucun `server-only`) : utilisable par les
// Server Actions, la console Admin et les tests.
// =============================================================================

export type ManualBillingLanguage = "fr" | "en";

type Message = { fr: string; en: string; tone: "success" | "info" | "error" };

/** Résultats de admin_issue_manual_invoice. */
export const MANUAL_INVOICE_ISSUE_OUTCOMES = [
  "issued",
  "already_issued",
  "organization_not_found",
  "organization_not_active",
  "invalid_idempotency_key",
  "invalid_plan",
  "plan_is_free",
  "plan_requires_quote",
  "invalid_cycle",
  "invalid_period",
  "invalid_due_date",
  "issue_idempotency_conflict",
  "provider_managed_subscription",
  "currency_not_supported",
  "no_catalog_price",
  // NCE-01 : une facture non annulée existe déjà pour cette période.
  "period_already_invoiced",
] as const;

/** Résultats de admin_confirm_manual_invoice_payment. */
export const MANUAL_PAYMENT_CONFIRM_OUTCOMES = [
  "confirmed",
  "already_paid",
  "invalid_idempotency_key",
  "invoice_not_found",
  "payment_idempotency_conflict",
  "invoice_not_open",
  "organization_archived",
  "note_required",
  "invalid_reference",
  "currency_mismatch",
  "amount_mismatch",
  "subscription_not_found",
  "provider_managed_subscription",
] as const;

export type ManualBillingOutcome =
  | (typeof MANUAL_INVOICE_ISSUE_OUTCOMES)[number]
  | (typeof MANUAL_PAYMENT_CONFIRM_OUTCOMES)[number];

export const MANUAL_BILLING_MESSAGES: Record<ManualBillingOutcome, Message> = {
  issued: {
    tone: "success",
    fr: "Facture émise. Elle reste à régler : aucun forfait n'est activé avant la confirmation du règlement.",
    en: "Invoice issued. It remains payable: no plan is activated before the payment is confirmed.",
  },
  already_issued: {
    tone: "info",
    fr: "Cette facture avait déjà été émise (double soumission évitée).",
    en: "This invoice had already been issued (duplicate submission prevented).",
  },
  organization_not_found: {
    tone: "error",
    fr: "Organization introuvable.",
    en: "Organization not found.",
  },
  organization_not_active: {
    tone: "error",
    fr: "Cette Organization est suspendue ou archivée : aucune nouvelle facture ne peut lui être émise.",
    en: "This Organization is suspended or archived: no new invoice can be issued to it.",
  },
  invalid_idempotency_key: {
    tone: "error",
    fr: "Jeton de soumission invalide. Rechargez le formulaire puis réessayez.",
    en: "Invalid submission token. Reload the form and try again.",
  },
  invalid_plan: {
    tone: "error",
    fr: "Forfait invalide.",
    en: "Invalid plan.",
  },
  plan_is_free: {
    tone: "error",
    fr: "Le forfait Découverte est gratuit : aucune facture n'est émise.",
    en: "The Discovery plan is free: no invoice is issued.",
  },
  plan_requires_quote: {
    tone: "error",
    fr: "Le forfait Sur mesure exige un devis : aucune facture catalogue n'est émise.",
    en: "The Custom plan requires a quote: no catalogue invoice is issued.",
  },
  invalid_cycle: {
    tone: "error",
    fr: "Cycle de facturation invalide (mensuel ou annuel).",
    en: "Invalid billing cycle (monthly or annual).",
  },
  invalid_period: {
    tone: "error",
    fr: "Période invalide : la fin doit être postérieure au début.",
    en: "Invalid period: the end must be after the start.",
  },
  invalid_due_date: {
    tone: "error",
    fr: "Échéance invalide : elle doit se situer entre aujourd'hui et la fin de période.",
    en: "Invalid due date: it must fall between today and the end of the period.",
  },
  issue_idempotency_conflict: {
    tone: "error",
    fr: "Ce jeton a déjà servi à émettre une facture différente. Rechargez le formulaire.",
    en: "This token was already used to issue a different invoice. Reload the form.",
  },
  provider_managed_subscription: {
    tone: "error",
    fr: "Cet abonnement est géré par un fournisseur de paiement : il ne peut pas être facturé ni confirmé manuellement.",
    en: "This subscription is managed by a payment provider: it cannot be invoiced or confirmed manually.",
  },
  period_already_invoiced: {
    tone: "error",
    fr: "Une facture existe déjà pour cette Organization et cette période (manuelle ou automatique). Aucune seconde facture n’a été émise.",
    en: "An invoice already exists for this Organization and period (manual or automatic). No second invoice was issued.",
  },
  currency_not_supported: {
    tone: "error",
    fr: "Devise non prise en charge : la facturation manuelle est réservée au XAF.",
    en: "Currency not supported: manual invoicing is limited to XAF.",
  },
  no_catalog_price: {
    tone: "error",
    fr: "Aucun prix catalogue pour ce forfait et ce cycle.",
    en: "No catalogue price for this plan and cycle.",
  },
  confirmed: {
    tone: "success",
    fr: "Règlement confirmé. L'abonnement est à jour.",
    en: "Payment confirmed. The subscription is up to date.",
  },
  already_paid: {
    tone: "info",
    fr: "Cette facture est déjà réglée : rien n'a été appliqué une seconde fois.",
    en: "This invoice is already paid: nothing was applied twice.",
  },
  invoice_not_found: {
    tone: "error",
    fr: "Facture introuvable.",
    en: "Invoice not found.",
  },
  payment_idempotency_conflict: {
    tone: "error",
    fr: "Ce jeton de confirmation a déjà servi pour une autre facture. Rechargez le formulaire.",
    en: "This confirmation token was already used for another invoice. Reload the form.",
  },
  invoice_not_open: {
    tone: "error",
    fr: "Cette facture n'est pas ouverte : aucun règlement ne peut y être rattaché.",
    en: "This invoice is not open: no payment can be recorded against it.",
  },
  organization_archived: {
    tone: "error",
    fr: "Cette Organization est archivée : restaurez-la avant toute opération de facturation.",
    en: "This Organization is archived: restore it before any billing operation.",
  },
  note_required: {
    tone: "error",
    fr: "Une note administrative d'au moins 3 caractères est obligatoire.",
    en: "An administrative note of at least 3 characters is required.",
  },
  invalid_reference: {
    tone: "error",
    fr: "Référence de règlement trop longue (200 caractères maximum).",
    en: "Payment reference too long (200 characters maximum).",
  },
  currency_mismatch: {
    tone: "error",
    fr: "La devise déclarée ne correspond pas à celle de la facture.",
    en: "The declared currency does not match the invoice currency.",
  },
  amount_mismatch: {
    tone: "error",
    fr: "Le montant déclaré ne correspond pas exactement au montant facturé.",
    en: "The declared amount does not exactly match the invoiced amount.",
  },
  subscription_not_found: {
    tone: "error",
    fr: "Aucun abonnement enregistré pour cette Organization.",
    en: "No subscription is recorded for this Organization.",
  },
};

/** Message générique sûr pour un résultat non reconnu. */
export const MANUAL_BILLING_UNKNOWN_MESSAGE: Message = {
  tone: "error",
  fr: "Résultat inattendu : l'opération n'a pas pu être confirmée. Vérifiez l'état de la facture avant de réessayer.",
  en: "Unexpected result: the operation could not be confirmed. Check the invoice status before trying again.",
};

export function isManualBillingOutcome(value: unknown): value is ManualBillingOutcome {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MANUAL_BILLING_MESSAGES, value);
}

/** Message bilingue d'un résultat ; jamais le code brut pour un code inconnu. */
export function manualBillingOutcomeMessage(
  outcome: unknown,
  language: ManualBillingLanguage,
): { text: string; tone: Message["tone"]; known: boolean } {
  const entry = isManualBillingOutcome(outcome) ? MANUAL_BILLING_MESSAGES[outcome] : null;
  const message = entry ?? MANUAL_BILLING_UNKNOWN_MESSAGE;
  return { text: message[language], tone: message.tone, known: entry !== null };
}

/** Même borne que le SQL : 8 à 200 caractères. */
export function isValidManualBillingIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 200;
}
