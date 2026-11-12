import "server-only";

// =============================================================================
// KJORA — Communications : liaison serveur (NOTIFICATIONS-COMMUNICATIONS-E2E-01)
// =============================================================================
// Seul fichier qui touche la clé service_role et le transport réel. Jamais
// importé par un composant client ("server-only"). La logique (réservation,
// relance, idempotence) vit dans worker.ts et en base ; ici, uniquement
// l'adaptation aux RPC et le rendu des pièces jointes.
// =============================================================================

import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateBillingInvoicePdf } from "@/core/billing/invoice-pdf";
import { resolveBillingLegalIdentity } from "@/core/billing/legal-identity";
import { BILLING_CYCLE_LABELS, type InvoiceStatus } from "@/core/billing/model";
import { createResendTransport } from "@/core/email/resend-transport";
import { PLAN_LABELS, type PlanSlug } from "@/core/entitlements/model";
import { generateFinancialDocumentPdf } from "@/modules/documents/pdf";
import { loadDocumentRenderContext } from "@/modules/documents/render-context";
import type { FinancialDocumentRecord, FinancialDocumentStatus, FinancialDocumentType } from "@/modules/documents/model";
import {
  COMMUNICATIONS_ENV,
  isSaasAutoInvoicingEnabled,
  resolveTransactionalEmailStatus,
} from "@/modules/communications/config";
import { isSaasTemplateKey, rentDeliveryEmail, saasBillingEmail } from "@/modules/communications/emails";
import {
  drainEmailQueues,
  type ClaimedDelivery,
  type QueueAdapter,
  type RenderOutcome,
  type WorkerSummary,
} from "@/modules/communications/worker";

const LEASE_SECONDS = 900;

export function createServiceRoleClient(): SupabaseClient | null {
  const url = process.env[COMMUNICATIONS_ENV.supabaseUrl]?.trim();
  const secret = (process.env[COMMUNICATIONS_ENV.supabaseSecret] ?? process.env[COMMUNICATIONS_ENV.supabaseServiceRoleLegacy])?.trim();
  if (!url || !secret) return null;
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

// -----------------------------------------------------------------------------
// File des loyers
// -----------------------------------------------------------------------------

type RentClaimRow = {
  id: string; organization_id: string; document_id: string; recipient_email: string;
  language: "fr" | "en"; template_key: string; attempt_count: number; claim_token: string; is_owner_copy: boolean;
  resend_generation: number;
};
type RentClaim = ClaimedDelivery & { row: RentClaimRow };

type DocumentRow = {
  id: string; organization_id: string; tenant_id: string; lease_id: string | null; due_id: string | null;
  payment_id: string | null; document_type: FinancialDocumentType; reference: string;
  status: FinancialDocumentStatus; language: "fr" | "en"; issued_on: string; period_start: string | null;
  period_end: string | null; snapshot: Record<string, unknown>; template_version: string;
  storage_path: string | null; created_by: string | null; created_at: string;
  invalidated_at: string | null; invalidation_reason: string | null;
};

function documentRecord(row: DocumentRow): FinancialDocumentRecord {
  return { id: row.id, organizationId: row.organization_id, tenantId: row.tenant_id, leaseId: row.lease_id,
    dueId: row.due_id, paymentId: row.payment_id, type: row.document_type, reference: row.reference,
    status: row.status, language: row.language, issuedOn: row.issued_on, periodStart: row.period_start,
    periodEnd: row.period_end, snapshot: row.snapshot, templateVersion: row.template_version,
    storagePath: row.storage_path, createdBy: row.created_by, createdAt: row.created_at,
    invalidatedAt: row.invalidated_at, invalidationReason: row.invalidation_reason, tenantEmail: null, lastDelivery: null };
}

function rentAdapter(supabase: SupabaseClient): QueueAdapter<ClaimedDelivery> {
  const adapter: QueueAdapter<RentClaim> = {
    async claim(batchSize) {
      const result = await supabase.rpc("claim_message_deliveries", { p_batch: batchSize, p_lease_seconds: LEASE_SECONDS });
      if (result.error) throw new Error("rent_queue_unavailable");
      return ((result.data ?? []) as RentClaimRow[]).map((row) => ({
        id: row.id, claimToken: row.claim_token, attemptCount: row.attempt_count,
        resendGeneration: Number(row.resend_generation ?? 0), row,
      }));
    },
    async render(delivery): Promise<RenderOutcome> {
      const documentResult = await supabase.from("financial_documents").select("*")
        .eq("organization_id", delivery.row.organization_id).eq("id", delivery.row.document_id).maybeSingle();
      if (documentResult.error) throw new Error("document_read_failed");
      if (!documentResult.data) return { kind: "cancel", reason: "document_unavailable" };
      const document = documentRecord(documentResult.data as DocumentRow);
      if (document.status === "invalidated") return { kind: "cancel", reason: "document_invalidated" };
      const bytes = await generateFinancialDocumentPdf(document, await loadDocumentRenderContext(supabase, document.id));
      if (!document.storagePath) {
        // Première matérialisation : copie privée versionnée, jamais publique.
        const storagePath = `${document.organizationId}/${document.id}/v1.pdf`;
        const upload = await supabase.storage.from("financial-documents").upload(storagePath, bytes, {
          contentType: "application/pdf", cacheControl: "31536000", upsert: false,
        });
        if (upload.error && !upload.error.message.toLowerCase().includes("exist")) throw new Error("document_upload_failed");
        const finalized = await supabase.rpc("finalize_financial_document_system", {
          target_document_id: document.id, target_storage_path: storagePath,
          target_content_sha256: createHash("sha256").update(bytes).digest("hex"),
          target_content_bytes: bytes.byteLength,
        });
        if (finalized.error) throw new Error("document_finalize_failed");
      }
      const email = rentDeliveryEmail(document, { templateKey: delivery.row.template_key, ownerCopy: delivery.row.is_owner_copy });
      return {
        kind: "send",
        message: {
          to: delivery.row.recipient_email,
          subject: email.subject, html: email.html, text: email.text,
          attachments: [{ filename: `${document.reference}.pdf`, contentBase64: Buffer.from(bytes).toString("base64") }],
          tags: [{ name: "queue", value: "rent" }, { name: "template", value: delivery.row.template_key.replace(/[^A-Za-z0-9_\-]/g, "_") }],
        },
      };
    },
    async markSending(delivery) {
      const result = await supabase.rpc("mark_message_delivery_sending", {
        p_delivery_id: delivery.id, p_claim_token: delivery.claimToken,
      });
      return !result.error && result.data === true;
    },
    async markUnknown(delivery, code) {
      const result = await supabase.rpc("mark_message_delivery_unknown", {
        p_delivery_id: delivery.id, p_claim_token: delivery.claimToken, p_error_code: code,
      });
      return !result.error && result.data === true;
    },
    async complete(delivery, providerMessageId) {
      const result = await supabase.rpc("complete_message_delivery", {
        p_delivery_id: delivery.id, p_claim_token: delivery.claimToken, p_provider_message_id: providerMessageId,
      });
      return !result.error && result.data === true;
    },
    async fail(delivery, code, retryable) {
      const result = await supabase.rpc("fail_message_delivery", {
        p_delivery_id: delivery.id, p_claim_token: delivery.claimToken, p_error_code: code, p_retryable: retryable,
      });
      return !result.error && result.data === true;
    },
    async cancel(delivery, reason) {
      const result = await supabase.rpc("cancel_message_delivery", {
        p_delivery_id: delivery.id, p_claim_token: delivery.claimToken, p_reason: reason,
      });
      return !result.error && result.data === true;
    },
  };
  return adapter as unknown as QueueAdapter<ClaimedDelivery>;
}

// -----------------------------------------------------------------------------
// File SaaS
// -----------------------------------------------------------------------------

type SaasClaimRow = {
  id: string; organization_id: string; billing_invoice_id: string; recipient_email: string;
  language: "fr" | "en"; template_key: string; attempt_count: number; claim_token: string;
  resend_generation: number;
};
type SaasClaim = ClaimedDelivery & { row: SaasClaimRow };

type SaasInvoiceRow = {
  id: string; organizationName: string; number: string; plan: PlanSlug; billingCycle: "monthly" | "annual";
  currency: string; amountMinor: number; periodStart: string; periodEnd: string; dueOn: string | null;
  status: InvoiceStatus; issuedOn: string; paidAt: string | null; manualReference: string | null;
};

function saasAdapter(supabase: SupabaseClient): QueueAdapter<ClaimedDelivery> {
  const adapter: QueueAdapter<SaasClaim> = {
    async claim(batchSize) {
      const result = await supabase.rpc("claim_billing_email_deliveries", { p_batch: batchSize, p_lease_seconds: LEASE_SECONDS });
      if (result.error) throw new Error("saas_queue_unavailable");
      return ((result.data ?? []) as SaasClaimRow[]).map((row) => ({
        id: row.id, claimToken: row.claim_token, attemptCount: row.attempt_count,
        resendGeneration: Number(row.resend_generation ?? 0), row,
      }));
    },
    async render(delivery): Promise<RenderOutcome> {
      const template = delivery.row.template_key;
      if (!isSaasTemplateKey(template)) return { kind: "cancel", reason: "unknown_template" };
      // Émetteur légal non configuré : document provisoire, JAMAIS d'envoi
      // final automatique. Mise en attente sans consommer de tentative.
      const issuer = resolveBillingLegalIdentity(process.env);
      if (!issuer) return { kind: "hold", reason: "legal_identity_missing" };
      const result = await supabase.rpc("get_billing_invoice_for_delivery", { p_invoice_id: delivery.row.billing_invoice_id });
      if (result.error) throw new Error("invoice_read_failed");
      const invoice = result.data as SaasInvoiceRow | null;
      if (!invoice || invoice.currency !== "XAF") return { kind: "cancel", reason: "invoice_unavailable" };
      if (template === "saas_receipt" ? invoice.status !== "paid" : invoice.status !== "open") {
        return { kind: "cancel", reason: "invoice_state_changed" };
      }
      const language = delivery.row.language;
      const planLabel = PLAN_LABELS[invoice.plan]?.[language] ?? invoice.plan;
      const cycleLabel = language === "en" ? (invoice.billingCycle === "annual" ? "Annual" : "Monthly") : BILLING_CYCLE_LABELS[invoice.billingCycle];
      const bytes = await generateBillingInvoicePdf({
        organizationName: invoice.organizationName, number: invoice.number, plan: invoice.plan,
        planLabel, billingCycleLabel: cycleLabel, currency: "XAF", amountMinor: invoice.amountMinor,
        periodStart: invoice.periodStart, periodEnd: invoice.periodEnd, dueOn: invoice.dueOn,
        issuedOn: invoice.issuedOn, status: invoice.status, paidAt: invoice.paidAt,
        manualReference: invoice.manualReference, issuer, language,
      });
      const email = saasBillingEmail(template, {
        number: invoice.number, organizationName: invoice.organizationName, planLabel, cycleLabel,
        amountMinor: invoice.amountMinor, periodStart: invoice.periodStart, periodEnd: invoice.periodEnd,
        dueOn: invoice.dueOn, paidAt: invoice.paidAt,
      }, language);
      return {
        kind: "send",
        message: {
          to: delivery.row.recipient_email,
          subject: email.subject, html: email.html, text: email.text,
          attachments: [{ filename: `${invoice.number}.pdf`, contentBase64: Buffer.from(bytes).toString("base64") }],
          tags: [{ name: "queue", value: "saas" }, { name: "template", value: template }],
        },
      };
    },
    async markSending(delivery) {
      const result = await supabase.rpc("mark_billing_email_sending", {
        p_delivery_id: delivery.id, p_claim_token: delivery.claimToken,
      });
      return !result.error && result.data === true;
    },
    async markUnknown(delivery, code) {
      const result = await supabase.rpc("mark_billing_email_unknown", {
        p_delivery_id: delivery.id, p_claim_token: delivery.claimToken, p_error_code: code,
      });
      return !result.error && result.data === true;
    },
    async complete(delivery, providerMessageId) {
      const result = await supabase.rpc("complete_billing_email_delivery", {
        p_delivery_id: delivery.id, p_claim_token: delivery.claimToken, p_provider_message_id: providerMessageId,
      });
      return !result.error && result.data === true;
    },
    async fail(delivery, code, retryable) {
      const result = await supabase.rpc("fail_billing_email_delivery", {
        p_delivery_id: delivery.id, p_claim_token: delivery.claimToken, p_error_code: code, p_retryable: retryable,
      });
      return !result.error && result.data === true;
    },
    async cancel(delivery, reason) {
      const result = await supabase.rpc("cancel_billing_email_delivery", {
        p_delivery_id: delivery.id, p_claim_token: delivery.claimToken, p_reason: reason,
      });
      return !result.error && result.data === true;
    },
    async hold(delivery, reason) {
      const result = await supabase.rpc("hold_billing_email_delivery", {
        p_delivery_id: delivery.id, p_claim_token: delivery.claimToken, p_reason: reason,
      });
      return !result.error && result.data === true;
    },
  };
  return adapter as unknown as QueueAdapter<ClaimedDelivery>;
}

// -----------------------------------------------------------------------------
// Vidage des files (partagé par le cron et le déclenchement Admin)
// -----------------------------------------------------------------------------

export type DrainResult =
  | { status: "drained"; summary: WorkerSummary }
  | { status: "skipped"; reason: "email_not_configured"; missing: string[] }
  | { status: "error"; reason: "service_unavailable" | "worker_failed" };

export async function drainQueuesIfConfigured(supabase: SupabaseClient, deadline: number): Promise<DrainResult> {
  const status = resolveTransactionalEmailStatus(process.env);
  if (!status.operational) return { status: "skipped", reason: "email_not_configured", missing: status.missing };
  const apiKey = process.env[COMMUNICATIONS_ENV.resendApiKey]?.trim() ?? "";
  const from = process.env[COMMUNICATIONS_ENV.from]?.trim() ?? "";
  try {
    const summary = await drainEmailQueues({
      from,
      transport: createResendTransport({ apiKey }),
      rent: rentAdapter(supabase),
      saas: saasAdapter(supabase),
      batchSize: 5,
      maxBatchesPerQueue: 4,
      deadline,
    });
    return { status: "drained", summary };
  } catch {
    return { status: "error", reason: "worker_failed" };
  }
}

// -----------------------------------------------------------------------------
// Orchestrateur quotidien unique (cron Vercel)
// -----------------------------------------------------------------------------

export type DailyRunResult = {
  ok: boolean;
  runId: string | null;
  saasInvoicingDryRun: boolean;
  database: Record<string, unknown> | null;
  delivery: DrainResult;
};

export async function runDailyCommunications(startedAt: number): Promise<DailyRunResult> {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return { ok: false, runId: null, saasInvoicingDryRun: true, database: null, delivery: { status: "error", reason: "service_unavailable" } };
  }
  const dryRun = !isSaasAutoInvoicingEnabled(process.env);
  const daily = await supabase.rpc("run_communications_daily_system", { p_dry_run: dryRun });
  if (daily.error) {
    return { ok: false, runId: null, saasInvoicingDryRun: dryRun, database: null, delivery: { status: "error", reason: "service_unavailable" } };
  }
  const database = (daily.data ?? {}) as Record<string, unknown>;
  const runId = typeof database.runId === "string" ? database.runId : null;
  // Marge de sécurité sous la durée maximale de la fonction (60 s).
  const delivery = await drainQueuesIfConfigured(supabase, startedAt + 45_000);
  const ok = delivery.status !== "error";
  if (runId) {
    await supabase.rpc("finish_operation_run_system", {
      p_run_id: runId,
      p_summary: { delivery: summarizeDrain(delivery) },
      p_succeeded: ok,
    });
  }
  return { ok, runId, saasInvoicingDryRun: dryRun, database, delivery };
}

/** Compteurs seulement : jamais une adresse, un sujet ni un identifiant fournisseur. */
export function summarizeDrain(result: DrainResult): Record<string, unknown> {
  if (result.status === "drained") return { status: "drained", ...result.summary };
  if (result.status === "skipped") return { status: "skipped", reason: result.reason, missing: result.missing };
  return { status: "error", reason: result.reason };
}
