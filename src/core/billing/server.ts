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
  type SubscriptionStatus,
  type BillingCycle,
  type BillingCurrency,
  type InvoiceStatus,
} from "@/core/billing/model";
import { isPlanSlug, type PlanSlug } from "@/core/entitlements/model";

export type SubscriptionView = {
  exists: boolean;
  status: SubscriptionStatus;
  plan: PlanSlug;
  billingCycle: BillingCycle;
  currency: BillingCurrency;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  renewalDate: string | null;
  graceEndsOn: string | null;
  cancellationEffectiveOn: string | null;
  scheduledPlan: PlanSlug | null;
  scheduledCycle: BillingCycle | null;
  scheduledEffectiveOn: string | null;
  pendingPlan: PlanSlug | null;
  pendingCycle: BillingCycle | null;
  pendingAmountMinor: number | null;
  provider: string | null;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
  paymentMethodExpiresOn: string | null;
};

export type BillingOverview = {
  organizationId: string;
  /** Plan qui gouverne réellement les entitlements (ALIGN-01). */
  effectivePlan: PlanSlug;
  subscription: SubscriptionView;
  usage: {
    activeProperties: number;
    activeUnits: number;
    collaborators: number;
    organizations: number;
  };
  quotas: {
    maxProperties: number | null;
    maxActiveUnits: number | null;
    maxCollaborators: number | null;
    maxOrganizations: number | null;
  };
};

export type BillingInvoice = {
  id: string;
  number: string;
  plan: PlanSlug;
  billingCycle: BillingCycle;
  currency: BillingCurrency;
  amountMinor: number;
  periodStart: string;
  periodEnd: string;
  status: InvoiceStatus;
  issuedOn: string;
  paidAt: string | null;
};

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

export async function listBillingInvoices(organizationId: string): Promise<BillingInvoice[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_billing_invoices", {
    target_organization_id: organizationId,
  });
  if (error || !Array.isArray(data)) return [];

  return (data as Array<Record<string, unknown>>).flatMap((row) => {
    const p = plan(row.plan);
    if (!p || typeof row.id !== "string") return [];
    return [{
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
    }];
  });
}

// ---------------------------------------------------------------------------
// Actions — le client n'envoie jamais de montant
// ---------------------------------------------------------------------------

export type PlanChangeResult = Record<string, unknown> & { outcome?: string };

export async function requestPlanChange(
  organizationId: string,
  targetPlan: PlanSlug,
  targetCycle: BillingCycle,
): Promise<PlanChangeResult | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("request_plan_change", {
    target_organization_id: organizationId,
    target_plan: targetPlan,
    target_cycle: targetCycle,
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
