import "server-only";

export type WhatsAppDelivery = {
  idempotencyKey: string;
  phoneE164: string;
  templateKey: string;
  language: "fr" | "en";
  variables: Readonly<Record<string, string>>;
};

export type WhatsAppProviderResult =
  | { accepted: true; providerMessageRef: string }
  | { accepted: false; code: "blocked_configuration" | "provider_failed" | "delivery_unknown" };

export interface OfficialWhatsAppProvider {
  readonly name: string;
  readonly enabled: boolean;
  send(delivery: WhatsAppDelivery): Promise<WhatsAppProviderResult>;
}

export const disabledWhatsAppProvider: OfficialWhatsAppProvider = {
  name: "disabled",
  enabled: false,
  async send() {
    return { accepted: false, code: "blocked_configuration" };
  },
};

export function whatsappProvider(env: NodeJS.ProcessEnv = process.env): OfficialWhatsAppProvider {
  // Un futur adapter officiel exigera une revue dédiée. Aucun nom de variable
  // ni présence de secret ne peut activer implicitement un fournisseur.
  void env.KJORA_WHATSAPP_PROVIDER;
  return disabledWhatsAppProvider;
}
