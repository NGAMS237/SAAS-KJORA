// =============================================================================
// KJORA — Configuration des communications (NOTIFICATIONS-COMMUNICATIONS-E2E-01)
// =============================================================================
// Module PUR : la source des variables est passée en paramètre. Ne renvoie
// JAMAIS la valeur d'un secret — seulement des booléens, des NOMS de
// variables manquantes et l'adresse d'expédition (publique par nature).
// =============================================================================

export const COMMUNICATIONS_ENV = {
  resendApiKey: "RESEND_TRANSACTIONAL_API_KEY",
  from: "KJORA_TRANSACTIONAL_EMAIL_FROM",
  deliveryEnabled: "KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED",
  webhookSecret: "RESEND_WEBHOOK_SECRET",
  cronSecret: "CRON_SECRET",
  saasAutoInvoicing: "KJORA_SAAS_AUTO_INVOICING_ENABLED",
  supabaseUrl: "NEXT_PUBLIC_SUPABASE_URL",
  supabaseSecret: "SUPABASE_SECRET_KEY",
  supabaseServiceRoleLegacy: "SUPABASE_SERVICE_ROLE_KEY",
  vercelEnv: "VERCEL_ENV",
} as const;

type EnvSource = Record<string, string | undefined>;

function present(env: EnvSource, name: string): boolean {
  return Boolean(env[name]?.trim());
}

/** Adresse seule, extraite de « Nom <adresse> » ; null si invalide. */
export function senderAddress(from: string | undefined | null): string | null {
  const value = (from ?? "").trim();
  if (!value) return null;
  const match = value.match(/<([^<>\s]+@[^<>\s]+\.[^<>\s]+)>\s*$/) ?? value.match(/^([^<>\s]+@[^<>\s]+\.[^<>\s]+)$/);
  return match ? match[1].toLowerCase() : null;
}

export type TransactionalEmailStatus = {
  /** Interrupteur explicite KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED=true. */
  deliveryEnabled: boolean;
  /** Clé, expéditeur valide et interrupteur présents : l'envoi peut réellement partir. */
  operational: boolean;
  senderAddress: string | null;
  /** Noms (jamais valeurs) des variables manquantes. */
  missing: string[];
};

export function resolveTransactionalEmailStatus(env: EnvSource): TransactionalEmailStatus {
  const deliveryEnabled = env[COMMUNICATIONS_ENV.deliveryEnabled]?.trim() === "true";
  const sender = senderAddress(env[COMMUNICATIONS_ENV.from]);
  const missing: string[] = [];
  if (!present(env, COMMUNICATIONS_ENV.resendApiKey)) missing.push(COMMUNICATIONS_ENV.resendApiKey);
  if (!sender) missing.push(COMMUNICATIONS_ENV.from);
  if (!deliveryEnabled) missing.push(COMMUNICATIONS_ENV.deliveryEnabled);
  return { deliveryEnabled, operational: missing.length === 0, senderAddress: sender, missing };
}

export function isProductionDeployment(env: EnvSource): boolean {
  const vercelEnv = env[COMMUNICATIONS_ENV.vercelEnv]?.trim();
  if (vercelEnv) return vercelEnv === "production";
  // A self-hosted `next start` process (including Hostinger) has no
  // VERCEL_ENV. In that case NODE_ENV=production must remain fail-closed:
  // the simulated delivery action is a development/Preview tool, never a
  // production affordance.
  return env.NODE_ENV?.trim() === "production";
}

/** Génération automatique des factures SaaS en écriture réelle (sinon dry-run). */
export function isSaasAutoInvoicingEnabled(env: EnvSource): boolean {
  return env[COMMUNICATIONS_ENV.saasAutoInvoicing]?.trim() === "true";
}

/**
 * Autorisation du cron : en-tête exact « Bearer <CRON_SECRET> », comparé en
 * temps constant par l'appelant. Sans secret configuré, toujours refusé.
 */
export function expectedCronAuthorization(env: EnvSource): string | null {
  const secret = env[COMMUNICATIONS_ENV.cronSecret]?.trim();
  return secret && secret.length >= 16 ? `Bearer ${secret}` : null;
}
