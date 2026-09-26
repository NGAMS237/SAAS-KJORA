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
  /** ADMIN-02 — masqué des listes actives (jamais supprimé). */
  archived: boolean;
  updatedAt: string;
};

/** ADMIN-02 — filtre d'archivage pour la liste des abonnements. */
export type ArchivedFilter = "active" | "archived" | "all";

/** ADMIN-02 — historique d'audit d'un abonnement (billing_events, event_type admin_*). */
export type SubscriptionAuditEvent = {
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  payload: Record<string, unknown>;
  actorUserId: string | null;
  createdAt: string;
};

/** ADMIN-02 — détail complet d'un abonnement, pour la page de détail. */
export type SubscriptionDetail = {
  organizationId: string;
  organizationName: string;
  status: string;
  plan: string;
  billingCycle: string;
  currency: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  renewalDate: string | null;
  graceEndsOn: string | null;
  blockedAt: string | null;
  cancellationRequestedAt: string | null;
  cancellationEffectiveOn: string | null;
  scheduledPlan: string | null;
  scheduledCycle: string | null;
  scheduledEffectiveOn: string | null;
  archivedAt: string | null;
  archivedBy: string | null;
  updatedAt: string;
  recentEvents: SubscriptionAuditEvent[];
};

export type { Paginated };

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
    archived: r.archived === true,
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
  archivedFilter: ArchivedFilter = "active",
): Promise<ReadResult<Paginated<AdminSubscriptionRow>>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_list_subscriptions", {
    page_limit: limit,
    page_offset: offset,
    search_term: filters.search?.trim() || null,
    plan_filter: filters.plan?.trim() || null,
    status_filter: filters.status?.trim() || null,
    currency_filter: filters.currency?.trim() || null,
    archived_filter: archivedFilter,
  });
  if (error || !data) return { ok: false, reason: classify(error) };

  return {
    ok: true,
    data: parsePagedPayload(data, mapSubscriptionRow, limit, offset),
  };
}

/** ADMIN-02 — détail complet d'un abonnement, pour /administration/abonnements/[organizationId]. */
export async function getSubscriptionDetail(
  organizationId: string,
): Promise<ReadResult<SubscriptionDetail | null>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_get_subscription", {
    target_organization_id: organizationId,
  });
  if (error || !data) return { ok: false, reason: classify(error) };

  const payload = data as Record<string, unknown>;
  if (payload.found !== true) return { ok: true, data: null };

  const events = Array.isArray(payload.recentEvents) ? payload.recentEvents : [];

  return {
    ok: true,
    data: {
      organizationId: String(payload.organizationId ?? ""),
      organizationName: String(payload.organizationName ?? ""),
      status: String(payload.status ?? ""),
      plan: String(payload.plan ?? ""),
      billingCycle: String(payload.billingCycle ?? ""),
      currency: String(payload.currency ?? ""),
      currentPeriodStart: payload.currentPeriodStart ? String(payload.currentPeriodStart) : null,
      currentPeriodEnd: payload.currentPeriodEnd ? String(payload.currentPeriodEnd) : null,
      renewalDate: payload.renewalDate ? String(payload.renewalDate) : null,
      graceEndsOn: payload.graceEndsOn ? String(payload.graceEndsOn) : null,
      blockedAt: payload.blockedAt ? String(payload.blockedAt) : null,
      cancellationRequestedAt: payload.cancellationRequestedAt
        ? String(payload.cancellationRequestedAt)
        : null,
      cancellationEffectiveOn: payload.cancellationEffectiveOn
        ? String(payload.cancellationEffectiveOn)
        : null,
      scheduledPlan: payload.scheduledPlan ? String(payload.scheduledPlan) : null,
      scheduledCycle: payload.scheduledCycle ? String(payload.scheduledCycle) : null,
      scheduledEffectiveOn: payload.scheduledEffectiveOn ? String(payload.scheduledEffectiveOn) : null,
      archivedAt: payload.archivedAt ? String(payload.archivedAt) : null,
      archivedBy: payload.archivedBy ? String(payload.archivedBy) : null,
      updatedAt: String(payload.updatedAt ?? ""),
      recentEvents: events.map((e) => {
        const ev = e as Record<string, unknown>;
        return {
          eventType: String(ev.event_type ?? ""),
          fromStatus: ev.from_status ? String(ev.from_status) : null,
          toStatus: ev.to_status ? String(ev.to_status) : null,
          payload: (ev.payload as Record<string, unknown>) ?? {},
          actorUserId: ev.actor_user_id ? String(ev.actor_user_id) : null,
          createdAt: String(ev.created_at ?? ""),
        };
      }),
    },
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
