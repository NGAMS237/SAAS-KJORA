import "server-only";

// =============================================================================
// KJORA — Couche serveur Billing SaaS (ALIGN-03)
// =============================================================================
// Lit et pilote l'abonnement via les RPC. Aucun montant n'est jamais transmis
// par le client : les devis sont calculés côté serveur à partir de l'état
// stocké et du catalogue de prix.
// =============================================================================

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isSubscriptionStatus,
  isBillingCycle,
  isBillingCurrency,
  isInvoiceStatus,
  type BillingCycle,
} from "@/core/billing/model";
import { isPlanSlug, type PlanSlug } from "@/core/entitlements/model";
import { configuredProviders } from "@/core/billing/provider-config";
import { affordanceFor, routeProvider } from "@/core/billing/provider-routing";
import type {
  BillingCheckoutAffordance,
  BillingInvoice,
  BillingOverview,
  SubscriptionView,
} from "@/core/billing/types";
import type { BillingCountry } from "@/core/onboarding/plan-intent";

// Les types de vue vivent dans `types.ts`, qui est pur : le client peut les
// importer sans franchir la frontière `server-only`. On les ré-exporte ici
// par commodité pour les appelants serveur déjà en place.
export type {
  BillingCheckoutAffordance,
  BillingInvoice,
  BillingOverview,
  SubscriptionView,
} from "@/core/billing/types";

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const plan = (v: unknown): PlanSlug | null =>
  typeof v === "string" && isPlanSlug(v) ? v : null;

function parseSubscription(raw: unknown): SubscriptionView {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    exists: r.exists === true,
    status: isSubscriptionStatus(r.status) ? r.status : "free",
    plan: plan(r.plan) ?? "decouverte",
    billingCycle: isBillingCycle(r.billingCycle) ? r.billingCycle : "monthly",
    currency: isBillingCurrency(r.currency) ? r.currency : "XAF",
    currentPeriodStart: str(r.currentPeriodStart),
    currentPeriodEnd: str(r.currentPeriodEnd),
    renewalDate: str(r.renewalDate),
    graceEndsOn: str(r.graceEndsOn),
    cancellationEffectiveOn: str(r.cancellationEffectiveOn),
    scheduledPlan: plan(r.scheduledPlan),
    scheduledCycle: isBillingCycle(r.scheduledCycle) ? r.scheduledCycle : null,
    scheduledEffectiveOn: str(r.scheduledEffectiveOn),
    pendingPlan: plan(r.pendingPlan),
    pendingCycle: isBillingCycle(r.pendingCycle) ? r.pendingCycle : null,
    pendingAmountMinor: num(r.pendingAmountMinor),
    provider: str(r.provider),
    paymentMethodBrand: str(r.paymentMethodBrand),
    paymentMethodLast4: str(r.paymentMethodLast4),
    paymentMethodExpiresOn: str(r.paymentMethodExpiresOn),
  };
}

export async function getBillingOverview(organizationId: string): Promise<BillingOverview | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_billing_overview", {
    target_organization_id: organizationId,
  });
  if (error || !data) return null;

  const r = data as Record<string, unknown>;
  const usage = (r.usage ?? {}) as Record<string, unknown>;
  const quotas = (r.quotas ?? {}) as Record<string, unknown>;

  return {
    organizationId,
    effectivePlan: plan(r.effectivePlan) ?? "decouverte",
    subscription: parseSubscription(r.subscription),
    usage: {
      activeProperties: num(usage.activeProperties) ?? 0,
      activeUnits: num(usage.activeUnits) ?? 0,
      collaborators: num(usage.collaborators) ?? 0,
      organizations: num(usage.organizations) ?? 0,
    },
    quotas: {
      maxProperties: num(quotas.maxProperties),
      maxActiveUnits: num(quotas.maxActiveUnits),
      maxCollaborators: num(quotas.maxCollaborators),
      maxOrganizations: num(quotas.maxOrganizations),
    },
  };
}

function parseBillingInvoiceRow(row: Record<string, unknown>): BillingInvoice | null {
  const p = plan(row.plan);
  if (!p || typeof row.id !== "string") return null;
  return {
    id: row.id,
    number: str(row.number) ?? "",
    plan: p,
    billingCycle: isBillingCycle(row.billing_cycle) ? row.billing_cycle : "monthly",
    currency: isBillingCurrency(row.currency) ? row.currency : "XAF",
    amountMinor: Number(row.amount_minor ?? 0),
    periodStart: str(row.period_start) ?? "",
    periodEnd: str(row.period_end) ?? "",
    status: isInvoiceStatus(row.status) ? row.status : "draft",
    issuedOn: str(row.issued_on) ?? "",
    paidAt: str(row.paid_at),
    manualReference: str(row.manual_reference),
    manualPaymentConfirmedAt: str(row.manual_payment_confirmed_at),
  };
}

export async function listBillingInvoices(organizationId: string): Promise<BillingInvoice[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_billing_invoices", {
    target_organization_id: organizationId,
  });
  if (error || !Array.isArray(data)) return [];

  return (data as Array<Record<string, unknown>>).flatMap((row) => {
    const invoice = parseBillingInvoiceRow(row);
    return invoice ? [invoice] : [];
  });
}

/**
 * REVENUE-01D. Une facture unique, avec le nom d'organisation nécessaire au
 * PDF (REVENUE-01B, `invoice-pdf.ts`). Réutilise `list_billing_invoices`
 * (déjà gardée par `billing.view`) plutôt que d'écrire une nouvelle RPC : la
 * liste est plafonnée à 200 lignes, aucun montant ni identifiant ne transite
 * par le client.
 */
export async function getBillingInvoiceForDownload(
  organizationId: string,
  invoiceId: string,
): Promise<(BillingInvoice & { organizationName: string }) | null> {
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, profile] = await Promise.all([
    supabase.rpc("list_billing_invoices", { target_organization_id: organizationId }),
    supabase.from("organization_profiles").select("name").eq("organization_id", organizationId).maybeSingle(),
  ]);
  if (error || !Array.isArray(data)) return null;

  const row = (data as Array<Record<string, unknown>>).find((r) => r.id === invoiceId);
  if (!row) return null;
  const invoice = parseBillingInvoiceRow(row);
  if (!invoice) return null;

  return { ...invoice, organizationName: str(profile.data?.name) ?? "" };
}

// ---------------------------------------------------------------------------
// Routage provider — le serveur décide, le client ne fait qu'observer
// ---------------------------------------------------------------------------

/**
 * Ce que l'interface a le droit de savoir sur le règlement en ligne.
 * Ne renvoie jamais le nom du provider retenu, ni la liste des configurés :
 * cette information n'a aucune utilité côté client et en dit trop sur
 * l'infrastructure.
 */
export function checkoutAffordance(args: {
  plan: PlanSlug;
  cycle: BillingCycle;
  currency: "XAF" | "CAD";
  amountMinor: number;
  methodHint?: unknown;
}): BillingCheckoutAffordance {
  return affordanceFor(
    routeProvider({
      plan: args.plan,
      cycle: args.cycle,
      currency: args.currency,
      amountMinor: args.amountMinor,
      configured: configuredProviders(),
      methodHint: args.methodHint,
    }),
  );
}

// ---------------------------------------------------------------------------
// Actions — le client n'envoie jamais de montant
// ---------------------------------------------------------------------------

export type PlanChangeResult = Record<string, unknown> & { outcome?: string };

export async function requestPlanChange(
  organizationId: string,
  targetPlan: PlanSlug,
  targetCycle: BillingCycle,
  targetBillingCountry: BillingCountry,
): Promise<PlanChangeResult | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("prepare_plan_change_for_market", {
    target_organization_id: organizationId,
    target_plan: targetPlan,
    target_cycle: targetCycle,
    target_billing_country: targetBillingCountry,
  });
  if (error) return null;
  return (data ?? null) as PlanChangeResult | null;
}

export async function cancelSubscription(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cancel_subscription", {
    target_organization_id: organizationId,
  });
  return error ? null : ((data ?? null) as PlanChangeResult | null);
}

export async function resumeSubscription(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resume_subscription", {
    target_organization_id: organizationId,
  });
  return error ? null : ((data ?? null) as PlanChangeResult | null);
}

export async function requestReactivation(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("request_reactivation", {
    target_organization_id: organizationId,
  });
  return error ? null : ((data ?? null) as PlanChangeResult | null);
}
