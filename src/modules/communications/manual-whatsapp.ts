export const WHATSAPP_STATES = ["unknown", "declared", "verified", "disabled"] as const;
export type WhatsAppState = (typeof WHATSAPP_STATES)[number];

export const SUPPORTED_CALLING_CODES: Record<string, string> = {
  CA: "1", CM: "237", CD: "243", CI: "225", KE: "254", NG: "234", SN: "221", ZA: "27",
};

export function normalizePhoneE164(countryCode: string, nationalNumber: string): string | null {
  const callingCode = SUPPORTED_CALLING_CODES[countryCode.trim().toUpperCase()];
  if (!callingCode) return null;
  let digits = nationalNumber.replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith(callingCode)) digits = digits.slice(callingCode.length);
  digits = digits.replace(/^0+/, "");
  const candidate = `+${callingCode}${digits}`;
  return /^\+[1-9][0-9]{7,14}$/.test(candidate) ? candidate : null;
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
