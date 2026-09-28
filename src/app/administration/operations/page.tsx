import { resolveBillingLegalIdentity } from "@/core/billing/legal-identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  COMMUNICATIONS_ENV,
  expectedCronAuthorization,
  isSaasAutoInvoicingEnabled,
  resolveTransactionalEmailStatus,
} from "@/modules/communications/config";
import {
  OperationsView,
  type DeliveryReview,
  type OperationRun,
  type OperationsOverview,
  type ProviderEvent,
} from "@/modules/platform-admin/operations-view";

export const dynamic = "force-dynamic";

type ReviewRow = {
  queue: "rent" | "saas"; delivery_id: string; organization_name: string; template_key: string;
  recipient_masked: string | null; attempt_count: number; resend_generation: number;
  review_reason: string; last_error_code: string | null; updated_at: string;
};

type EventRow = { event_type: string; matched_queue: string | null; outcome: string; received_at: string };

type RunRow = {
  run_id: string; run_type: string; trigger_source: string; dry_run: boolean; actor_email_masked: string | null;
  run_on: string; status: string; started_at: string; finished_at: string | null;
};

export default async function AdministrationOperationsPage() {
  const supabase = await createSupabaseServerClient();
  const [overviewResult, runsResult, reviewsResult, eventsResult] = await Promise.all([
    supabase.rpc("admin_communications_overview"),
    supabase.rpc("admin_list_operation_runs", { result_limit: 20 }),
    supabase.rpc("admin_list_delivery_reviews", { result_limit: 50 }),
    supabase.rpc("admin_list_provider_events", { result_limit: 30 }),
  ]);
  const error = overviewResult.error
    ? (overviewResult.error.code === "42501" ? "denied" as const : "failed" as const)
    : null;
  const raw = (overviewResult.data ?? null) as Record<string, unknown> | null;
  const overview: OperationsOverview | null = raw ? {
    dbCronLastRun: (raw.dbCronLastRun ?? null) as OperationsOverview["dbCronLastRun"],
    lastDailyRun: (raw.lastDailyRun ?? null) as OperationsOverview["lastDailyRun"],
    automaticInvoices30d: Number(raw.automaticInvoices30d ?? 0),
    dueNotices30d: Number(raw.dueNotices30d ?? 0),
    missingDueNotices: Number(raw.missingDueNotices ?? 0),
    rentDeliveries: (raw.rentDeliveries ?? {}) as Record<string, number>,
    saasDeliveries: (raw.saasDeliveries ?? {}) as Record<string, number>,
    saasDeliveriesHeldForLegalIdentity: Number(raw.saasDeliveriesHeldForLegalIdentity ?? 0),
    retryableFailures: Number(raw.retryableFailures ?? 0),
    retryableFailuresDueNow: Number(raw.retryableFailuresDueNow ?? 0),
    deliveryUnknown: Number(raw.deliveryUnknown ?? 0),
    providerFailed: Number(raw.providerFailed ?? 0),
    deliveryDelayedAwaitingOutcome: Number(raw.deliveryDelayedAwaitingOutcome ?? 0),
    providerEvents30d: (raw.providerEvents30d ?? {}) as Record<string, number>,
    organizationsWithoutCommunicationSettings: Number(raw.organizationsWithoutCommunicationSettings ?? 0),
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : null,
  } : null;
  const runs: OperationRun[] | null = runsResult.error ? null : ((runsResult.data ?? []) as RunRow[]).map((row) => ({
    runId: row.run_id, runType: row.run_type, triggerSource: row.trigger_source, dryRun: row.dry_run,
    actorEmailMasked: row.actor_email_masked, runOn: row.run_on, status: row.status,
    startedAt: row.started_at, finishedAt: row.finished_at,
  }));
  const reviews: DeliveryReview[] | null = reviewsResult.error ? null : ((reviewsResult.data ?? []) as ReviewRow[]).map((row) => ({
    queue: row.queue, deliveryId: row.delivery_id, organizationName: row.organization_name,
    templateKey: row.template_key, recipientMasked: row.recipient_masked, attemptCount: row.attempt_count,
    resendGeneration: row.resend_generation, reviewReason: row.review_reason,
    lastErrorCode: row.last_error_code, updatedAt: row.updated_at,
  }));
  const events: ProviderEvent[] | null = eventsResult.error ? null : ((eventsResult.data ?? []) as EventRow[]).map((row) => ({
    eventType: row.event_type, matchedQueue: row.matched_queue, outcome: row.outcome, receivedAt: row.received_at,
  }));
  const email = resolveTransactionalEmailStatus(process.env);
  return <OperationsView
    config={{
      emailOperational: email.operational,
      missingEmailVariables: email.missing,
      senderAddress: email.senderAddress,
      saasAutoInvoicing: isSaasAutoInvoicingEnabled(process.env),
      webhookSecretConfigured: Boolean(process.env[COMMUNICATIONS_ENV.webhookSecret]?.trim()),
      cronSecretConfigured: expectedCronAuthorization(process.env) !== null,
      legalIdentityConfigured: resolveBillingLegalIdentity(process.env) !== null,
    }}
    error={error}
    overview={overview}
    events={events}
    reviews={reviews}
    runs={runs}
  />;
}
