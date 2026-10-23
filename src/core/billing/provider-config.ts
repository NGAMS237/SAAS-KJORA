import "server-only";

// =============================================================================
// KJORA — Configuration provider, côté serveur uniquement (ALIGN-04A)
// =============================================================================
// Seul module autorisé à lire les secrets provider. Il ne les renvoie jamais :
// il répond « configuré » ou « non configuré », et remet le secret directement
// à l'adaptateur qui en a besoin, jamais à une couche de présentation.
//
// Garde-fous durs :
//   1. Aucune variable provider ne porte le préfixe NEXT_PUBLIC_ — un test
//      échoue si c'est le cas.
//   2. Test et Live sont mutuellement exclusifs.
//   3. Live exige les trois gates du pilote et une configuration complète ;
//      une clé live présente seule ne constitue jamais une autorisation.
// =============================================================================

import type { ProviderName } from "./provider-capabilities.ts";
import type { ProviderMode } from "./provider.ts";
import { isStripeLiveSecret, isStripePublishableKey, isStripeTestSecret, isStripeWebhookSecret } from "./stripe-test-safety.ts";
import { readStripePriceMapping, type StripeEnvironment } from "./stripe-price-contract.ts";
import { resolveStripeEnvironment } from "./stripe-mode.ts";

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
 * Mode d'exécution fermé. L'absence de sélecteur, un sélecteur invalide ou la
 * coexistence Test/Live ferment Stripe. Live n'est reconnu que derrière un
 * choix explicite et les trois drapeaux du pilote.
 */
export function providerMode(): ProviderMode {
  return stripeEnvironment() === "live" ? "live" : "sandbox";
}

export function isLiveModeAllowed(): boolean {
  return stripeEnvironment() === "live";
}

export function stripeEnvironment(env: NodeJS.ProcessEnv = process.env): StripeEnvironment | null {
  return resolveStripeEnvironment(env);
}

export function stripeServerConfig(env: NodeJS.ProcessEnv = process.env) {
  const environment = stripeEnvironment(env);
  if (!environment) return null;
  const live = environment === "live";
  const secret = env[live ? "STRIPE_LIVE_SECRET_KEY" : "STRIPE_SANDBOX_SECRET_KEY"]?.trim() ?? "";
  const webhook = env[live ? "STRIPE_LIVE_WEBHOOK_SECRET" : "STRIPE_SANDBOX_WEBHOOK_SECRET"]?.trim() ?? "";
  const publishable = env[live ? "STRIPE_LIVE_PUBLISHABLE_KEY" : "STRIPE_TEST_PUBLISHABLE_KEY"]?.trim() ?? "";
  if (!(live ? isStripeLiveSecret(secret) : isStripeTestSecret(secret))) return null;
  if (!isStripeWebhookSecret(webhook)) return null;
  if (live && !isStripePublishableKey(publishable, "live")) return null;
  if (!live && publishable && !isStripePublishableKey(publishable, "test")) return null;
  if (!readStripePriceMapping(environment, env)) return null;
  return { environment, mode: live ? "live" as const : "sandbox" as const, secret, webhook, publishable };
}

function readSecret(key: string): string | null {
  const value = process.env[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function isProviderConfigured(name: ProviderName): boolean {
  const keys = PROVIDER_ENV_KEYS[name];
  if (name === "stripe") {
    return stripeServerConfig() !== null;
  }
  return readSecret(keys.secret) !== null && readSecret(keys.webhook) !== null;
}

// ---------------------------------------------------------------------------
// REVENUE-01F — Coupe-circuit (kill switch)
// ---------------------------------------------------------------------------
// Un levier d'urgence, lu depuis l'environnement, pour arrêter le routage
// checkout ET la réception de webhooks d'un provider (ou de tous) sans
// toucher ni retirer ses secrets. Absent tant qu'aucune variable n'est
// positionnée : ce lot construit le mécanisme, il ne l'active pas — aucune
// de ces variables n'existe dans Vercel à ce stade (aucune modification de
// Vercel ou de ses variables n'est faite par ce mandat).
//
//   • BILLING_KILL_SWITCH_ALL=1                  coupe tous les providers.
//   • BILLING_KILL_SWITCH_<PROVIDER_EN_MAJ>=1    coupe un seul provider
//     (ex. BILLING_KILL_SWITCH_FLUTTERWAVE=1).
//
// Une valeur absente ou différente de "1" laisse le provider intact : le
// comportement par défaut, sans aucune variable positionnée, est identique
// à avant ce lot (aucun test existant ne doit changer de résultat).

function isKillSwitchOn(key: string): boolean {
  return process.env[key]?.trim() === "1";
}

export function isProviderKillSwitched(name: ProviderName): boolean {
  if (isKillSwitchOn("BILLING_KILL_SWITCH_ALL")) return true;
  if (name === "stripe" && stripeEnvironment() === "live" && isKillSwitchOn("BILLING_KILL_SWITCH_STRIPE_LIVE")) return true;
  return isKillSwitchOn(`BILLING_KILL_SWITCH_${name.toUpperCase()}`);
}

/** Liste réellement configurée ET non coupée, à passer au routage. */
export function configuredProviders(): ProviderName[] {
  return (Object.keys(PROVIDER_ENV_KEYS) as ProviderName[]).filter(
    (name) => isProviderConfigured(name) && !isProviderKillSwitched(name),
  );
}

/**
 * Secret de signature d'un webhook. Réservé à la vérification de signature.
 * Ne jamais journaliser la valeur, ne jamais la renvoyer dans une réponse HTTP.
 */
export function webhookSecret(name: ProviderName): string | null {
  if (name === "stripe") return stripeServerConfig()?.webhook ?? null;
  return readSecret(PROVIDER_ENV_KEYS[name].webhook);
}

export function apiSecret(name: ProviderName): string | null {
  if (name === "stripe") return stripeServerConfig()?.secret ?? null;
  return readSecret(PROVIDER_ENV_KEYS[name].secret);
}
