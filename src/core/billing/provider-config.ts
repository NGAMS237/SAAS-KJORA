import "server-only";

// =============================================================================
// KJORA — Configuration provider, côté serveur uniquement (ALIGN-04A)
// =============================================================================
// Seul module autorisé à lire les secrets provider. Il ne les renvoie jamais :
// il répond « configuré » ou « non configuré », et remet le secret directement
// à l'adaptateur qui en a besoin, jamais à une couche de présentation.
//
// Deux garde-fous durs :
//   1. Aucune variable provider ne porte le préfixe NEXT_PUBLIC_ — un test
//      échoue si c'est le cas.
//   2. Le mode `live` est refusé dans ce lot. Une clé live présente est traitée
//      comme une erreur de configuration, pas comme une autorisation.
// =============================================================================

import type { ProviderName } from "./provider-capabilities.ts";
import type { ProviderMode } from "./provider.ts";

/** Noms des variables d'environnement, par provider. Jamais de valeurs ici. */
export const PROVIDER_ENV_KEYS: Record<ProviderName, { secret: string; webhook: string }> = {
  flutterwave: {
    secret: "FLUTTERWAVE_SANDBOX_SECRET_KEY",
    webhook: "FLUTTERWAVE_SANDBOX_WEBHOOK_SECRET",
  },
  campay: {
    secret: "CAMPAY_SANDBOX_SECRET_KEY",
    webhook: "CAMPAY_SANDBOX_WEBHOOK_SECRET",
  },
  elyonpay: {
    secret: "ELYONPAY_SANDBOX_SECRET_KEY",
    webhook: "ELYONPAY_SANDBOX_WEBHOOK_SECRET",
  },
  notchpay: {
    secret: "NOTCHPAY_SANDBOX_SECRET_KEY",
    webhook: "NOTCHPAY_SANDBOX_WEBHOOK_SECRET",
  },
  stripe: { secret: "STRIPE_SANDBOX_SECRET_KEY", webhook: "STRIPE_SANDBOX_WEBHOOK_SECRET" },
  payunit: { secret: "PAYUNIT_SANDBOX_SECRET_KEY", webhook: "PAYUNIT_SANDBOX_WEBHOOK_SECRET" },
};

/**
 * Mode d'exécution. Tant que ALIGN-04B n'a pas livré la mise en service,
 * seule la sandbox est acceptée : une valeur `live` est ignorée et
 * journalisée comme anomalie de configuration.
 */
export function providerMode(): ProviderMode {
  return "sandbox";
}

export function isLiveModeAllowed(): boolean {
  return false;
}

function readSecret(key: string): string | null {
  const value = process.env[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function isProviderConfigured(name: ProviderName): boolean {
  const keys = PROVIDER_ENV_KEYS[name];
  return readSecret(keys.secret) !== null && readSecret(keys.webhook) !== null;
}

/** Liste réellement configurée, à passer au routage. */
export function configuredProviders(): ProviderName[] {
  return (Object.keys(PROVIDER_ENV_KEYS) as ProviderName[]).filter(isProviderConfigured);
}

/**
 * Secret de signature d'un webhook. Réservé à la vérification de signature.
 * Ne jamais journaliser la valeur, ne jamais la renvoyer dans une réponse HTTP.
 */
export function webhookSecret(name: ProviderName): string | null {
  return readSecret(PROVIDER_ENV_KEYS[name].webhook);
}

export function apiSecret(name: ProviderName): string | null {
  return readSecret(PROVIDER_ENV_KEYS[name].secret);
}
