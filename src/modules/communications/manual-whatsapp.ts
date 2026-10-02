import { phoneDefaultsForCountry, SUPPORTED_PHONE_COUNTRIES } from "../../core/currency/metadata.ts";

export const WHATSAPP_STATES = ["unknown", "declared", "tenant_confirmed", "verified", "disabled"] as const;
export type WhatsAppState = (typeof WHATSAPP_STATES)[number];

export const SUPPORTED_CALLING_CODES: Record<string, string> = Object.fromEntries(
  SUPPORTED_PHONE_COUNTRIES.map((entry) => [entry.countryCode, entry.callingCode]),
);

export function normalizePhoneE164(countryCode: string, nationalNumber: string): string | null {
  const country = phoneDefaultsForCountry(countryCode.trim().toUpperCase());
  if (!country || !new RegExp(country.nationalPattern).test(nationalNumber)) return null;
  return `+${country.callingCode}${nationalNumber}`;
}

export type ManualWhatsAppContext = {
  phoneE164: string; displayName: string; language: "fr" | "en";
  documentType: "due_notice" | "payment_receipt" | "rent_receipt" | "account_statement";
  periodStart: string | null; periodEnd: string | null;
};

const DOCUMENT_LABELS: Record<ManualWhatsAppContext["documentType"], [string, string]> = {
  due_notice: ["avis d’échéance", "due notice"], payment_receipt: ["reçu de paiement", "payment receipt"],
  rent_receipt: ["quittance de loyer", "rent receipt"], account_statement: ["état de compte", "account statement"],
};

const DOCUMENT_TYPES = new Set(Object.keys(DOCUMENT_LABELS));

export function normalizeManualWhatsAppContext(value: unknown): ManualWhatsAppContext | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.phoneE164 !== "string" || !/^\+[1-9][0-9]{7,14}$/.test(raw.phoneE164)) return null;
  if (typeof raw.documentType !== "string" || !DOCUMENT_TYPES.has(raw.documentType)) return null;
  const displayName = typeof raw.displayName === "string" && raw.displayName.trim() ? raw.displayName.trim().slice(0, 120) : "KJORA";
  const language: "fr" | "en" = raw.language === "en" ? "en" : "fr";
  const period = (item: unknown) => typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item) ? item : null;
  return { phoneE164: raw.phoneE164, displayName, language, documentType: raw.documentType as ManualWhatsAppContext["documentType"], periodStart: period(raw.periodStart), periodEnd: period(raw.periodEnd) };
}

export function buildManualWhatsAppMessage(context: ManualWhatsAppContext): string {
  const english = context.language === "en";
  const label = DOCUMENT_LABELS[context.documentType][english ? 1 : 0];
  const period = context.periodStart && context.periodEnd ? ` (${context.periodStart} – ${context.periodEnd})` : "";
  return english
    ? `Hello ${context.displayName}, your ${label}${period} is available in your secure KJORA tenant portal. For your safety, no private PDF is attached automatically.`
    : `Bonjour ${context.displayName}, votre ${label}${period} est disponible dans votre portail locataire KJORA sécurisé. Pour votre sécurité, aucun PDF privé n’est joint automatiquement.`;
}

export function buildWhatsAppUrl(phoneE164: string, message: string): string | null {
  if (!/^\+[1-9][0-9]{7,14}$/.test(phoneE164) || !message.trim() || message.length > 1600) return null;
  return `https://wa.me/${phoneE164.slice(1)}?text=${encodeURIComponent(message)}`;
}
