// =============================================================================
// NCE-01 — Réglages de communication propriétaire (module pur)
// =============================================================================

export type CommunicationSettings = {
  configured: boolean;
  dueNoticeEmailEnabled: boolean;
  overdueReminderEmailEnabled: boolean;
  paymentReceiptEmailEnabled: boolean;
  rentReceiptEmailEnabled: boolean;
  ownerCopyEnabled: boolean;
  ownerEmailDeliverable: boolean;
  tenantsWithoutEmail: number;
  updatedAt: string | null;
};

export const COMMUNICATION_TOGGLES = [
  "dueNoticeEmailEnabled",
  "overdueReminderEmailEnabled",
  "paymentReceiptEmailEnabled",
  "rentReceiptEmailEnabled",
  "ownerCopyEnabled",
] as const;
export type CommunicationToggle = (typeof COMMUNICATION_TOGGLES)[number];
export type CommunicationToggleValues = Record<CommunicationToggle, boolean>;

export function parseCommunicationSettings(value: unknown): CommunicationSettings | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const flag = (key: string) => row[key] === true;
  return {
    configured: flag("configured"),
    dueNoticeEmailEnabled: flag("dueNoticeEmailEnabled"),
    overdueReminderEmailEnabled: flag("overdueReminderEmailEnabled"),
    paymentReceiptEmailEnabled: flag("paymentReceiptEmailEnabled"),
    rentReceiptEmailEnabled: flag("rentReceiptEmailEnabled"),
    ownerCopyEnabled: flag("ownerCopyEnabled"),
    ownerEmailDeliverable: flag("ownerEmailDeliverable"),
    tenantsWithoutEmail: Math.max(0, Number(row.tenantsWithoutEmail ?? 0) || 0),
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
  };
}

/** Valide une saisie navigateur : exactement les cinq booléens attendus. */
export function parseToggleInput(input: unknown): CommunicationToggleValues | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const values = {} as CommunicationToggleValues;
  for (const key of COMMUNICATION_TOGGLES) {
    if (typeof row[key] !== "boolean") return null;
    values[key] = row[key] as boolean;
  }
  return values;
}

export function anyToggleEnabled(values: CommunicationToggleValues): boolean {
  return COMMUNICATION_TOGGLES.some((key) => values[key]);
}

export type CommunicationSettingsError =
  | "unauthenticated" | "forbidden" | "organization_unavailable" | "invalid_settings"
  | "email_not_configured" | "production_disabled" | "failed";

export function communicationSettingsMessage(code: CommunicationSettingsError, language: "FR" | "EN"): string {
  const fr = language === "FR";
  switch (code) {
    case "unauthenticated": return fr ? "Votre session a expiré. Reconnectez-vous." : "Your session has expired. Please sign in again.";
    case "forbidden": return fr ? "Seul le propriétaire de l’Organization peut modifier ces réglages." : "Only the Organization owner can change these settings.";
    case "organization_unavailable": return fr ? "Cette Organization n’est pas active." : "This Organization is not active.";
    case "invalid_settings": return fr ? "Réglages invalides. Rechargez la page." : "Invalid settings. Reload the page.";
    case "email_not_configured": return fr ? "L’envoi de courriels n’est pas encore configuré sur cet environnement : les envois ne peuvent pas être activés." : "Email delivery is not configured on this environment yet: deliveries cannot be enabled.";
    case "production_disabled": return fr ? "Le test d’envoi n’est pas disponible en production." : "Test delivery is not available in production.";
    default: return fr ? "Enregistrement impossible pour le moment. Réessayez." : "Unable to save right now. Please try again.";
  }
}

/** Adresse de simulation Resend : aucun destinataire réel, aucune boîte réelle. */
export const RESEND_SIMULATED_DELIVERED = "delivered@resend.dev";

/** Clé d'idempotence du test : au plus un test par Organization et tranche de 10 minutes. */
export function testDeliveryIdempotencyKey(organizationId: string, nowMs: number): string {
  return `kjora-test-${organizationId}-${Math.floor(nowMs / 600_000)}`;
}
