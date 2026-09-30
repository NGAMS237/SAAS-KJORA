import { SAAS_TEMPLATE_KEYS, saasBillingEmail } from "./emails.ts";

export type ProviderTemplatePreview = {
  channel: "email" | "whatsapp";
  key: string;
  fr: string;
  en: string;
  recipientMasked: string | null;
};

const E164 = /^\+[1-9][0-9]{7,14}$/;

export function maskE164(value: string): string | null {
  if (!E164.test(value)) return null;
  return `${value.slice(0, Math.min(4, value.length - 2))}${"•".repeat(Math.max(4, value.length - 6))}${value.slice(-2)}`;
}

/** Prévisualisations entièrement fictives : aucun appel réseau et aucune PII. */
export function buildProviderTemplatePreviews(): ProviderTemplatePreview[] {
  const invoice = {
    number: "KJORA-TEST",
    organizationName: "Organization fictive / Sample organization",
    planLabel: "Pilote / Pilot",
    cycleLabel: "Mensuel / Monthly",
    amountMinor: 0,
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    dueOn: "2026-01-31",
    paidAt: "2026-01-31",
  };
  const emails = SAAS_TEMPLATE_KEYS.map((key) => ({
    channel: "email" as const,
    key,
    fr: saasBillingEmail(key, invoice, "fr").subject,
    en: saasBillingEmail(key, invoice, "en").subject,
    recipientMasked: null,
  }));
  return [...emails, {
    channel: "whatsapp",
    key: "due_notice_preview",
    fr: "Aperçu local : avis d’échéance — aucun message envoyé",
    en: "Local preview: due notice — no message sent",
    recipientMasked: maskE164("+237600000000"),
  }];
}
