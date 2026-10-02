export const OPERATIONS_SYSTEM_KEYS = [
  "commercial_site",
  "owner_app",
  "tenant_portal",
  "partners",
  "africa_billing",
  "stripe_test",
  "resend",
  "whatsapp_manual",
  "whatsapp_api",
  "automations",
  "pwa",
  "migrations",
  "support",
] as const;

export type OperationsSystemKey = (typeof OPERATIONS_SYSTEM_KEYS)[number];
export type OperationsSystemStatus =
  | "operational"
  | "configured_disabled"
  | "configuration_missing"
  | "attention_required";

export type OperationsSystemReadiness = {
  status: OperationsSystemStatus;
  missing: string[];
  testableNow: boolean;
  externalConfigurationRequired: boolean;
};

type EnvSource = Record<string, string | undefined>;

const STRIPE_PRICE_KEYS = [
  "STRIPE_TEST_PRICE_ESSENTIEL_MONTHLY_CAD",
  "STRIPE_TEST_PRICE_ESSENTIEL_ANNUAL_CAD",
  "STRIPE_TEST_PRICE_AVANCE_MONTHLY_CAD",
  "STRIPE_TEST_PRICE_AVANCE_ANNUAL_CAD",
  "STRIPE_TEST_PRICE_PATRIMOINE_MONTHLY_CAD",
  "STRIPE_TEST_PRICE_PATRIMOINE_ANNUAL_CAD",
] as const;

function missing(env: EnvSource, names: readonly string[]): string[] {
  return names.filter((name) => !env[name]?.trim());
}

function configured(status: OperationsSystemStatus, options: Partial<OperationsSystemReadiness> = {}): OperationsSystemReadiness {
  return {
    status,
    missing: options.missing ?? [],
    testableNow: options.testableNow ?? false,
    externalConfigurationRequired: options.externalConfigurationRequired ?? false,
  };
}

/**
 * Produit uniquement des états factuels. La présence d'un secret n'est jamais
 * considérée comme une preuve qu'un fournisseur répond réellement.
 */
export function resolveOperationsReadiness(env: EnvSource, signals: {
  africaOverviewAvailable: boolean;
  resendProviderEvidence: boolean;
  automationRunObserved: boolean;
}): Record<OperationsSystemKey, OperationsSystemReadiness> {
  const stripeEnabled = env.BILLING_PROVIDER_STRIPE_TEST_ENABLED?.trim() === "1";
  const stripeRequired = [
    "STRIPE_SANDBOX_SECRET_KEY",
    "STRIPE_SANDBOX_WEBHOOK_SECRET",
    "KJORA_APP_ORIGIN",
    ...STRIPE_PRICE_KEYS,
  ];
  const stripeMissing = missing(env, stripeRequired);
  if (env.STRIPE_SANDBOX_SECRET_KEY?.trim() && !env.STRIPE_SANDBOX_SECRET_KEY.trim().startsWith("sk_test_")) {
    stripeMissing.push("STRIPE_SANDBOX_SECRET_KEY");
  }
  if (env.STRIPE_SANDBOX_WEBHOOK_SECRET?.trim() && !env.STRIPE_SANDBOX_WEBHOOK_SECRET.trim().startsWith("whsec_")) {
    stripeMissing.push("STRIPE_SANDBOX_WEBHOOK_SECRET");
  }

  const resendEnabled = env.KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED?.trim() === "true";
  const resendMissing = missing(env, [
    "RESEND_TRANSACTIONAL_API_KEY",
    "KJORA_TRANSACTIONAL_EMAIL_FROM",
    "RESEND_WEBHOOK_SECRET",
  ]);
  const cronMissing = missing(env, ["CRON_SECRET"]);
  if (env.CRON_SECRET?.trim() && env.CRON_SECRET.trim().length < 16) cronMissing.push("CRON_SECRET");

  return {
    commercial_site: env.KJORA_COMMERCIAL_SITE_URL?.trim()
      ? configured("attention_required", { testableNow: true, externalConfigurationRequired: true })
      : configured("configuration_missing", { missing: ["KJORA_COMMERCIAL_SITE_URL"], externalConfigurationRequired: true }),
    owner_app: configured("operational", { testableNow: true }),
    tenant_portal: configured("operational", { testableNow: true }),
    partners: configured("operational", { testableNow: true }),
    africa_billing: configured(signals.africaOverviewAvailable ? "operational" : "attention_required", {
      testableNow: signals.africaOverviewAvailable,
    }),
    stripe_test: !stripeEnabled
      ? configured("configured_disabled", { missing: [...new Set(stripeMissing)], externalConfigurationRequired: true })
      : stripeMissing.length
        ? configured("configuration_missing", { missing: [...new Set(stripeMissing)], externalConfigurationRequired: true })
        : configured("attention_required", { testableNow: true, externalConfigurationRequired: true }),
    resend: !resendEnabled
      ? configured("configured_disabled", { missing: resendMissing, externalConfigurationRequired: true })
      : resendMissing.length
        ? configured("configuration_missing", { missing: resendMissing, externalConfigurationRequired: true })
        : configured(signals.resendProviderEvidence ? "operational" : "attention_required", {
          testableNow: true,
          externalConfigurationRequired: !signals.resendProviderEvidence,
        }),
    whatsapp_manual: configured("attention_required", { testableNow: true }),
    whatsapp_api: configured("configured_disabled", { externalConfigurationRequired: true }),
    automations: cronMissing.length
      ? configured("configuration_missing", { missing: [...new Set(cronMissing)], externalConfigurationRequired: true })
      : configured(signals.automationRunObserved ? "operational" : "attention_required", { testableNow: true }),
    pwa: configured("operational", { testableNow: true }),
    migrations: configured("attention_required", { externalConfigurationRequired: true }),
    support: configured("attention_required", { externalConfigurationRequired: true }),
  };
}
