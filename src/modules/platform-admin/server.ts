import "server-only";

// =============================================================================
// KJORA — ADMIN-01 — Accès aux données de la console plateforme
// =============================================================================
// Toutes les lectures passent par des RPC SECURITY DEFINER qui vérifient
// elles-mêmes l'autorisation plateforme (private.assert_platform_admin). La
// garde est donc appliquée à CHAQUE OPÉRATION, indépendamment de la garde de
// page : contourner l'interface ne contourne pas le contrôle.
//
// Aucune écriture. Aucune clé de service. Le client Supabase utilisé est celui
// de la session de l'utilisateur, avec sa clé publiable — la même que le reste
// de l'application.
// =============================================================================

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  deriveState,
  notConnectedIndicator,
  UNMONITORED_SERVICES,
  type MonitoringIndicator,
} from "./monitoring";
import { parsePagedPayload, toNumber, type Paginated } from "./pagination";

export const DEFAULT_PAGE_SIZE = 25;

export type PlatformCounters = {
  organizationsTotal: number;
  organizationsActive: number;
  organizationsSuspended: number;
  /**
   * ADMIN-01.1 — abonnements RÉELLEMENT enregistrés (organization_subscriptions)
   * uniquement. Une Organization sans ligne de facturation n'est comptée ni
   * gratuite ni payante : voir `organizationsWithoutSubscription`.
   */
  subscriptionsFree: number;
  subscriptionsPaid: number;
  organizationsWithoutSubscription: number;
  /** Forfait effectif (organization_plans) en désaccord avec la facturation enregistrée. */
  planBillingMismatches: number;
  subscriptionsByStatus: Record<string, number>;
  subscriptionsByPlan: Record<string, number>;
  generatedAt: string | null;
};

/** ADMIN-01.1 — paramètres de recherche/filtre, tous optionnels. */
export type OrganizationFilters = {
  search?: string;
  status?: string;
};

export type SubscriptionFilters = {
  search?: string;
  plan?: string;
  status?: string;
  currency?: string;
};

export type AdminOrganizationRow = {
  organizationId: string;
  name: string;
  status: string;
  createdAt: string;
  memberCount: number;
  plan: string;
  billingStatus: string;
};

export type AdminSubscriptionRow = {
  organizationId: string;
  organizationName: string;
  status: string;
  plan: string;
  billingCycle: string;
  currency: string;
  currentPeriodEnd: string | null;
  renewalDate: string | null;
  graceEndsOn: string | null;
  hasProvider: boolean;
  updatedAt: string;
};

export type { Paginated };

// =============================================================================
// ADMIN-BILLING-OPS-01 — Fiche Organization détaillée
// =============================================================================

export type CommercialInterventionType =
  | "complimentary"
  | "offline_payment"
  | "promotion"
  | "partnership"
  | "support_adjustment";

export type CommercialReasonCode =
  | "sales_gift"
  | "partner_offer"
  | "manual_payment_received"
  | "promotional_campaign"
  | "support_goodwill"
  | "other";

export type ActiveIntervention = {
  interventionId: string;
  interventionType: CommercialInterventionType;
  reasonCode: CommercialReasonCode;
  adminNote: string;
  grantedPlan: string;
  startsOn: string;
  endsOn: string | null;
  currency: string | null;
  amountMinor: number | null;
  manualReference: string | null;
  createdByEmail: string | null;
  createdAt: string;
  extensionCount: number;
  effectivelyExpired: boolean;
};

export type AdminCommercialEvent = {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  actorEmail: string | null;
};

export type OrganizationDetail = {
  organizationId: string;
  name: string;
  status: string;
  createdAt: string;
  ownerEmail: string | null;
  activeMemberCount: number;
  propertiesCount: number;
  unitsCount: number;
  effectivePlan: string;
  subscription: {
    exists: boolean;
    status: string;
    plan: string;
    billingCycle: string;
    currency: string;
    currentPeriodEnd: string | null;
    renewalDate: string | null;
    provider: string | null;
  };
  planBillingMismatch: boolean;
  activeIntervention: ActiveIntervention | null;
  recentAdminEvents: AdminCommercialEvent[];
};

function mapActiveIntervention(raw: unknown): ActiveIntervention | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    interventionId: String(r.interventionId ?? ""),
    interventionType: String(r.interventionType ?? "") as CommercialInterventionType,
    reasonCode: String(r.reasonCode ?? "") as CommercialReasonCode,
    adminNote: String(r.adminNote ?? ""),
    grantedPlan: String(r.grantedPlan ?? ""),
    startsOn: String(r.startsOn ?? ""),
    endsOn: r.endsOn ? String(r.endsOn) : null,
    currency: r.currency ? String(r.currency) : null,
    amountMinor: r.amountMinor === null || r.amountMinor === undefined ? null : toNumber(r.amountMinor),
    manualReference: r.manualReference ? String(r.manualReference) : null,
    createdByEmail: r.createdByEmail ? String(r.createdByEmail) : null,
    createdAt: String(r.createdAt ?? ""),
    extensionCount: toNumber(r.extensionCount),
    effectivelyExpired: r.effectivelyExpired === true,
  };
}

function mapRecentEvents(raw: unknown): AdminCommercialEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      eventId: String(r.event_id ?? ""),
      eventType: String(r.event_type ?? ""),
      payload: (r.payload ?? {}) as Record<string, unknown>,
      createdAt: String(r.created_at ?? ""),
      actorEmail: r.actor_email ? String(r.actor_email) : null,
    };
  });
}

export async function getOrganizationDetail(
  organizationId: string,
): Promise<ReadResult<OrganizationDetail | null>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_get_organization_detail", {
    target_organization_id: organizationId,
  });
  if (error || !data) return { ok: false, reason: classify(error) };

  const payload = data as Record<string, unknown>;
  if (payload.found !== true) {
    return { ok: true, data: null };
  }

  const sub = (payload.subscription ?? {}) as Record<string, unknown>;

  return {
    ok: true,
    data: {
      organizationId: String(payload.organizationId ?? ""),
      name: String(payload.name ?? ""),
      status: String(payload.status ?? ""),
      createdAt: String(payload.createdAt ?? ""),
      ownerEmail: payload.ownerEmail ? String(payload.ownerEmail) : null,
      activeMemberCount: toNumber(payload.activeMemberCount),
      propertiesCount: toNumber(payload.propertiesCount),
      unitsCount: toNumber(payload.unitsCount),
      effectivePlan: String(payload.effectivePlan ?? "decouverte"),
      subscription: {
        exists: sub.exists === true,
        status: String(sub.status ?? "free"),
        plan: String(sub.plan ?? "decouverte"),
        billingCycle: String(sub.billingCycle ?? "monthly"),
        currency: String(sub.currency ?? "XAF"),
        currentPeriodEnd: sub.currentPeriodEnd ? String(sub.currentPeriodEnd) : null,
        renewalDate: sub.renewalDate ? String(sub.renewalDate) : null,
        provider: sub.provider ? String(sub.provider) : null,
      },
      planBillingMismatch: payload.planBillingMismatch === true,
      activeIntervention: mapActiveIntervention(payload.activeIntervention),
      recentAdminEvents: mapRecentEvents(payload.recentAdminEvents),
    },
  };
}

export type InterventionCounters = {
  activeInterventions: number;
  complimentaryActive: number;
  offlinePaymentsActive: number;
  expiringNext30Days: number;
};

export async function getInterventionCounters(): Promise<ReadResult<InterventionCounters>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_commercial_intervention_counters");
  if (error || !data) return { ok: false, reason: classify(error) };
  const payload = data as Record<string, unknown>;
  return {
    ok: true,
    data: {
      activeInterventions: toNumber(payload.activeInterventions),
      complimentaryActive: toNumber(payload.complimentaryActive),
      offlinePaymentsActive: toNumber(payload.offlinePaymentsActive),
      expiringNext30Days: toNumber(payload.expiringNext30Days),
    },
  };
}

/** Résultat de lecture : le refus et l'échec sont distingués de la donnée. */
export type ReadResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "denied" | "failed" };

function toCountRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    out[key] = toNumber(raw);
  }
  return out;
}

/**
 * Une RPC refusée renvoie le code Postgres 42501 (insufficient_privilege),
 * levé par private.assert_platform_admin. On le distingue d'une panne pour que
 * l'interface n'annonce pas « incident » là où il s'agit d'un refus.
 */
function classify(error: { code?: string } | null): "denied" | "failed" {
  return error?.code === "42501" ? "denied" : "failed";
}

export async function getPlatformCounters(): Promise<ReadResult<PlatformCounters>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_platform_counters");
  if (error || !data) return { ok: false, reason: classify(error) };

  const payload = data as Record<string, unknown>;
  return {
    ok: true,
    data: {
      organizationsTotal: toNumber(payload.organizations_total),
      organizationsActive: toNumber(payload.organizations_active),
      organizationsSuspended: toNumber(payload.organizations_suspended),
      subscriptionsFree: toNumber(payload.subscriptions_free),
      subscriptionsPaid: toNumber(payload.subscriptions_paid),
      organizationsWithoutSubscription: toNumber(payload.organizations_without_subscription),
      planBillingMismatches: toNumber(payload.plan_billing_mismatches),
      subscriptionsByStatus: toCountRecord(payload.subscriptions_by_status),
      subscriptionsByPlan: toCountRecord(payload.subscriptions_by_plan),
      generatedAt: typeof payload.generated_at === "string" ? payload.generated_at : null,
    },
  };
}

function mapOrganizationRow(r: Record<string, unknown>): AdminOrganizationRow {
  return {
    organizationId: String(r.organization_id ?? ""),
    name: String(r.name ?? ""),
    status: String(r.status ?? ""),
    createdAt: String(r.created_at ?? ""),
    memberCount: toNumber(r.member_count),
    plan: String(r.plan ?? ""),
    billingStatus: String(r.billing_status ?? ""),
  };
}

function mapSubscriptionRow(r: Record<string, unknown>): AdminSubscriptionRow {
  return {
    organizationId: String(r.organization_id ?? ""),
    organizationName: String(r.organization_name ?? ""),
    status: String(r.status ?? ""),
    plan: String(r.plan ?? ""),
    billingCycle: String(r.billing_cycle ?? ""),
    currency: String(r.currency ?? ""),
    currentPeriodEnd: r.current_period_end ? String(r.current_period_end) : null,
    renewalDate: r.renewal_date ? String(r.renewal_date) : null,
    graceEndsOn: r.grace_ends_on ? String(r.grace_ends_on) : null,
    hasProvider: r.has_provider === true,
    updatedAt: String(r.updated_at ?? ""),
  };
}

export async function listOrganizations(
  limit = DEFAULT_PAGE_SIZE,
  offset = 0,
  filters: OrganizationFilters = {},
): Promise<ReadResult<Paginated<AdminOrganizationRow>>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_list_organizations", {
    page_limit: limit,
    page_offset: offset,
    search_term: filters.search?.trim() || null,
    status_filter: filters.status?.trim() || null,
  });
  // La RPC renvoie désormais un objet jsonb (jamais un jeu de lignes vide sans
  // porteur pour le total) — voir pagination.ts. `!data` reste un échec : un
  // objet jsonb valide, même pour une page vide, n'est jamais null/undefined.
  if (error || !data) return { ok: false, reason: classify(error) };

  return {
    ok: true,
    data: parsePagedPayload(data, mapOrganizationRow, limit, offset),
  };
}

export async function listSubscriptions(
  limit = DEFAULT_PAGE_SIZE,
  offset = 0,
  filters: SubscriptionFilters = {},
): Promise<ReadResult<Paginated<AdminSubscriptionRow>>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_list_subscriptions", {
    page_limit: limit,
    page_offset: offset,
    search_term: filters.search?.trim() || null,
    plan_filter: filters.plan?.trim() || null,
    status_filter: filters.status?.trim() || null,
    currency_filter: filters.currency?.trim() || null,
  });
  if (error || !data) return { ok: false, reason: classify(error) };

  return {
    ok: true,
    data: parsePagedPayload(data, mapSubscriptionRow, limit, offset),
  };
}

/**
 * Construit le tableau de suivi.
 *
 * Trois indicateurs sont adossés à des données réelles de l'application, et
 * quatre services restent `not_connected` faute de source vérifiable.
 *
 * Les anomalies comptabilisées sont des faits mesurés dans nos propres
 * données : Organizations suspendues, abonnements en échec de paiement ou
 * bloqués. Aucune n'est déduite d'une supposition.
 */
export async function getMonitoringIndicators(now = new Date()): Promise<MonitoringIndicator[]> {
  const supabase = await createSupabaseServerClient();
  const indicators: MonitoringIndicator[] = [];

  // --- Événements applicatifs : fraîcheur réelle -----------------------------
  const freshness = await supabase.rpc("admin_events_freshness");
  if (freshness.error) {
    indicators.push({
      key: "app_events",
      state: "unavailable",
      observedAt: null,
      source: "billing_events (lecture échouée)",
    });
  } else {
    const latest = freshness.data ? new Date(String(freshness.data)) : null;
    const valid = latest && !Number.isNaN(latest.getTime()) ? latest : null;
    indicators.push({
      key: "app_events",
      state: deriveState({ ok: true, latest: valid }, now),
      observedAt: valid ? valid.toISOString() : null,
      source: "billing_events",
    });
  }

  // --- Organizations et abonnements : anomalies mesurées ---------------------
  const counters = await getPlatformCounters();
  if (!counters.ok) {
    indicators.push({
      key: "organizations",
      state: "unavailable",
      observedAt: null,
      source: "admin_platform_counters (lecture échouée)",
    });
    indicators.push({
      key: "subscriptions",
      state: "unavailable",
      observedAt: null,
      source: "admin_platform_counters (lecture échouée)",
    });
  } else {
    const c = counters.data;
    const observedAt = c.generatedAt;

    indicators.push({
      key: "organizations",
      state: deriveState(
        { ok: true, latest: observedAt ? new Date(observedAt) : null, anomalies: c.organizationsSuspended },
        now,
      ),
      observedAt,
      source: "organizations",
      detail:
        c.organizationsSuspended > 0
          ? `${c.organizationsSuspended} suspendue(s) / ${c.organizationsTotal}`
          : `${c.organizationsTotal} au total`,
    });

    const failing =
      (c.subscriptionsByStatus.payment_failed ?? 0) +
      (c.subscriptionsByStatus.billing_blocked ?? 0);
    const totalSubs = Object.values(c.subscriptionsByStatus).reduce((a, b) => a + b, 0);

    indicators.push({
      key: "subscriptions",
      state: deriveState(
        {
          ok: true,
          // Sans aucun abonnement, il n'y a rien d'observé : `not_connected`,
          // et surtout pas « normal ».
          latest: totalSubs > 0 && observedAt ? new Date(observedAt) : null,
          anomalies: failing,
        },
        now,
      ),
      observedAt: totalSubs > 0 ? observedAt : null,
      source: "organization_subscriptions",
      detail:
        failing > 0
          ? `${failing} en échec ou bloqué(s) / ${totalSubs}`
          : `${totalSubs} au total`,
    });

    // --- Incohérence forfait/facturation : anomalie réellement mesurée -------
    // Jamais « not_connected » : la comparaison organization_plans ×
    // organization_subscriptions est une source intégrée, toujours calculée,
    // même quand son résultat est zéro. La console signale, ne corrige rien.
    indicators.push({
      key: "plan_billing_mismatch",
      state: deriveState(
        { ok: true, latest: observedAt ? new Date(observedAt) : now, anomalies: c.planBillingMismatches },
        now,
      ),
      observedAt,
      source: "organization_plans × organization_subscriptions",
      detail:
        c.planBillingMismatches > 0
          ? `${c.planBillingMismatches} Organization(s) : forfait effectif et abonnement enregistré en désaccord`
          : "aucune incohérence détectée",
    });
  }

  // --- Services sans source fiable ------------------------------------------
  for (const service of UNMONITORED_SERVICES) {
    indicators.push(notConnectedIndicator(service.key, service.source));
  }

  return indicators;
}

// =============================================================================
// FINANCE-ADMIN-01 — Aperçu financier (lecture seule)
// =============================================================================
// Même discipline que le reste de ce fichier : aucune écriture, aucune clé de
// service, montants renvoyés en unités mineures (centimes / plus petite unité
// XAF) SANS jamais additionner CAD et XAF entre eux — chaque valeur reste
// rangée par devise dans son propre Record.

// Le filtre de période lui-même vit dans finance-periods.ts (module PUR, sans
// "server-only") : un composant client (views.tsx) doit pouvoir l'importer
// directement pour peupler le <select>, ce que ce fichier lui interdirait.
// Ré-exporté ici pour que page.tsx (composant serveur) n'ait qu'un seul point
// d'import pour tout ce qui concerne les Finances.
import { FINANCE_PERIOD_FILTERS, isFinancePeriodFilter, type FinancePeriodFilter } from "./finance-periods";
export { FINANCE_PERIOD_FILTERS, isFinancePeriodFilter, type FinancePeriodFilter };

export type FinanceSummary = {
  periodKey: string;
  periodStart: string | null;
  periodEnd: string | null;
  counters: {
    organizationsTotal: number;
    subscriptionsFree: number;
    subscriptionsPaid: number;
    organizationsWithoutSubscription: number;
    planBillingMismatches: number;
    activeCommercialInterventions: number;
    activeComplimentary: number;
    registeredOfflinePayments: number;
  };
  charts: {
    subscriptionsByPlan: Record<string, number>;
    freePaidBreakdown: { free: number; paid: number; withoutSubscription: number };
    /** Unités mineures, par devise. Jamais fusionné entre devises. */
    expectedRevenueByCurrency: Record<string, number>;
  };
  /** Unités mineures, par devise — encaissé hors ligne uniquement. */
  collectedOfflineByCurrency: Record<string, number>;
  stripeConnected: boolean;
  mobileMoneyConnected: boolean;
  /** Unités mineures, par devise — état courant, indépendant de la période. */
  expectedRevenueByCurrency: Record<string, number>;
  generatedAt: string | null;
};

export type FinanceEventSource = "subscription" | "manual_intervention" | "offline_payment" | string;

export type FinanceEventRow = {
  eventId: string;
  organizationId: string;
  organizationName: string;
  category: string;
  status: string;
  currency: string | null;
  amountMinor: number | null;
  source: FinanceEventSource;
  occurredAt: string;
};

export async function getFinanceSummary(
  periodFilter: FinancePeriodFilter = "last_30_days",
): Promise<ReadResult<FinanceSummary>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_finance_summary", {
    period_filter: periodFilter,
  });
  if (error || !data) return { ok: false, reason: classify(error) };

  const payload = data as Record<string, unknown>;
  const period = (payload.period ?? {}) as Record<string, unknown>;
  const counters = (payload.commercial_counters ?? {}) as Record<string, unknown>;
  const charts = (payload.charts ?? {}) as Record<string, unknown>;
  const freePaid = (charts.free_paid_breakdown ?? {}) as Record<string, unknown>;
  const collected = (payload.collected_revenue ?? {}) as Record<string, unknown>;
  const expected = (payload.expected_revenue ?? {}) as Record<string, unknown>;

  return {
    ok: true,
    data: {
      periodKey: String(period.key ?? periodFilter),
      periodStart: period.start ? String(period.start) : null,
      periodEnd: period.end ? String(period.end) : null,
      counters: {
        organizationsTotal: toNumber(counters.organizations_total),
        subscriptionsFree: toNumber(counters.subscriptions_free),
        subscriptionsPaid: toNumber(counters.subscriptions_paid),
        organizationsWithoutSubscription: toNumber(counters.organizations_without_subscription),
        planBillingMismatches: toNumber(counters.plan_billing_mismatches),
        activeCommercialInterventions: toNumber(counters.active_commercial_interventions),
        activeComplimentary: toNumber(counters.active_complimentary),
        registeredOfflinePayments: toNumber(counters.registered_offline_payments),
      },
      charts: {
        subscriptionsByPlan: toCountRecord(charts.subscriptions_by_plan),
        freePaidBreakdown: {
          free: toNumber(freePaid.free),
          paid: toNumber(freePaid.paid),
          withoutSubscription: toNumber(freePaid.without_subscription),
        },
        expectedRevenueByCurrency: toCountRecord(charts.expected_revenue_by_currency),
      },
      collectedOfflineByCurrency: toCountRecord(collected.offline_by_currency),
      stripeConnected: collected.stripe_connected === true,
      mobileMoneyConnected: collected.mobile_money_connected === true,
      expectedRevenueByCurrency: toCountRecord(expected.by_currency),
      generatedAt: typeof payload.generated_at === "string" ? payload.generated_at : null,
    },
  };
}

function mapFinanceEventRow(r: Record<string, unknown>): FinanceEventRow {
  return {
    eventId: String(r.event_id ?? ""),
    organizationId: String(r.organization_id ?? ""),
    organizationName: String(r.organization_name ?? ""),
    category: String(r.category ?? ""),
    status: String(r.status ?? ""),
    currency: r.currency ? String(r.currency) : null,
    amountMinor: r.amount_minor === null || r.amount_minor === undefined ? null : toNumber(r.amount_minor),
    source: String(r.source ?? ""),
    occurredAt: String(r.occurred_at ?? ""),
  };
}

export async function listFinanceRecentEvents(
  limit = DEFAULT_PAGE_SIZE,
  offset = 0,
  periodFilter: FinancePeriodFilter = "last_30_days",
): Promise<ReadResult<Paginated<FinanceEventRow>>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_finance_recent_events", {
    page_limit: limit,
    page_offset: offset,
    period_filter: periodFilter,
  });
  if (error || !data) return { ok: false, reason: classify(error) };

  return {
    ok: true,
    data: parsePagedPayload(data, mapFinanceEventRow, limit, offset),
  };
}

// ---------------------------------------------------------------------------
// REVENUE-01E — Extension Admin Finances (facturation manuelle Afrique,
// rappels automatiques, échecs de paiement). Second appel RPC, distinct de
// `getFinanceSummary` : voir supabase/migrations/
// 20260927170000_revenue_01e_admin_finance_extension.sql — la RPC
// FINANCE-ADMIN-01 n'est ni modifiée ni dupliquée.
// ---------------------------------------------------------------------------

export type FinanceBillingExtension = {
  periodKey: string;
  periodStart: string | null;
  periodEnd: string | null;
  manualInvoicing: {
    /** Unités mineures... non : un COMPTE de factures, par devise. Jamais une somme entre devises. */
    dueByCurrency: Record<string, number>;
    overdueByCurrency: Record<string, number>;
    paymentsConfirmedCount: number;
    /** Unités mineures encaissées via facturation manuelle (REVENUE-01B), par devise. */
    paymentsConfirmedByCurrency: Record<string, number>;
  };
  reminders: {
    sentInPeriod: number;
    dueNow: number;
  };
  paymentFailuresInPeriod: number;
  generatedAt: string | null;
};

export async function getFinanceBillingExtension(
  periodFilter: FinancePeriodFilter = "last_30_days",
): Promise<ReadResult<FinanceBillingExtension>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_finance_billing_extension", {
    period_filter: periodFilter,
  });
  if (error || !data) return { ok: false, reason: classify(error) };

  const payload = data as Record<string, unknown>;
  const period = (payload.period ?? {}) as Record<string, unknown>;
  const manualInvoicing = (payload.manual_invoicing ?? {}) as Record<string, unknown>;
  const reminders = (payload.reminders ?? {}) as Record<string, unknown>;

  return {
    ok: true,
    data: {
      periodKey: String(period.key ?? periodFilter),
      periodStart: period.start ? String(period.start) : null,
      periodEnd: period.end ? String(period.end) : null,
      manualInvoicing: {
        dueByCurrency: toCountRecord(manualInvoicing.due_by_currency),
        overdueByCurrency: toCountRecord(manualInvoicing.overdue_by_currency),
        paymentsConfirmedCount: toNumber(manualInvoicing.payments_confirmed_count),
        paymentsConfirmedByCurrency: toCountRecord(manualInvoicing.payments_confirmed_by_currency),
      },
      reminders: {
        sentInPeriod: toNumber(reminders.sent_in_period),
        dueNow: toNumber(reminders.due_now),
      },
      paymentFailuresInPeriod: toNumber(payload.payment_failures_in_period),
      generatedAt: typeof payload.generated_at === "string" ? payload.generated_at : null,
    },
  };
}
