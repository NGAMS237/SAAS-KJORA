import { formatXaf } from "./message-templates.ts";
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
  phoneE164: string; displayName: string; civility: "M." | "Mme" | null; language: "fr" | "en";
  /** Montant lié au document (XAF) : reçu = montant reçu, quittance = loyer + charges, avis = reste dû, état = solde. */
  amountXaf: number | null; dueDate: string | null;
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
  const civility = raw.civility === "M." || raw.civility === "Mme" ? raw.civility : null;
  const amountXaf = typeof raw.amountXaf === "number" && Number.isSafeInteger(raw.amountXaf) && raw.amountXaf >= 0 ? raw.amountXaf : null;
  const dueDate = typeof raw.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate) ? raw.dueDate : null;
  const language: "fr" | "en" = raw.language === "en" ? "en" : "fr";
  const period = (item: unknown) => typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item) ? item : null;
  return { phoneE164: raw.phoneE164, displayName, civility, amountXaf, dueDate, language, documentType: raw.documentType as ManualWhatsAppContext["documentType"], periodStart: period(raw.periodStart), periodEnd: period(raw.periodEnd) };
}

const frDate = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;

/**
 * Message WhatsApp manuel : civilité, montant du document et lien vers le portail locataire,
 * où le PDF se consulte et se télécharge. Aucun PDF privé n'est joint : wa.me ne sait envoyer que du texte.
 * `portalUrl` est l'adresse publique de la page du portail (https), fournie par le serveur.
 */
export function buildManualWhatsAppMessage(context: ManualWhatsAppContext, portalUrl?: string | null): string {
  const english = context.language === "en";
  const label = DOCUMENT_LABELS[context.documentType][english ? 1 : 0];
  const period = context.periodStart && context.periodEnd ? ` (${context.periodStart} – ${context.periodEnd})` : "";
  // Civilité renseignée sur la fiche locataire : « M. » / « Mme » (« Mr » / « Ms » en anglais).
  const title = context.civility ? `${english ? (context.civility === "M." ? "Mr" : "Ms") : context.civility} ` : "";
  const amount = context.amountXaf === null ? null : formatXaf(context.amountXaf);
  let detail: string;
  if (english) {
    const due = context.dueDate ? ` before ${frDate(context.dueDate)}` : "";
    detail = amount === null ? `your ${label}${period} is available`
      : context.documentType === "payment_receipt" ? `we received your payment of ${amount}: your ${label}${period} is available`
        : context.documentType === "due_notice" ? `your ${label}${period} is available: ${amount} to pay${due}`
          : context.documentType === "account_statement" ? `your ${label}${period} is available (balance: ${amount})`
            : `your ${label}${period} for ${amount} is available`;
  } else {
    const due = context.dueDate ? ` avant le ${frDate(context.dueDate)}` : "";
    detail = amount === null ? `votre ${label}${period} est disponible`
      : context.documentType === "payment_receipt" ? `nous avons bien reçu votre paiement de ${amount} : votre ${label}${period} est disponible`
        : context.documentType === "due_notice" ? `votre ${label}${period} est disponible : ${amount} à régler${due}`
          : context.documentType === "account_statement" ? `votre ${label}${period} est disponible (solde : ${amount})`
            : `votre ${label}${period} de ${amount} est disponible`;
  }
  const link = portalUrl && /^https?:\/\//.test(portalUrl) ? portalUrl : null;
  const tail = english
    ? ` Consult and download the PDF in your secure KJORA tenant portal${link ? `: ${link}` : "."}`
    : ` Consultez et téléchargez le PDF dans votre portail locataire KJORA sécurisé${link ? ` : ${link}` : "."}`;
  return `${english ? "Hello" : "Bonjour"} ${title}${context.displayName}, ${detail}.${tail}`;
}

export function buildWhatsAppUrl(phoneE164: string, message: string): string | null {
  if (!/^\+[1-9][0-9]{7,14}$/.test(phoneE164) || !message.trim() || message.length > 1600) return null;
  return `https://wa.me/${phoneE164.slice(1)}?text=${encodeURIComponent(message)}`;
}
