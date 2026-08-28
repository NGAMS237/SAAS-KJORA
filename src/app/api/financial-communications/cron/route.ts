import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { financialDocumentEmail, controlledDeliveryError } from "@/modules/documents/email";
import { generateFinancialDocumentPdf } from "@/modules/documents/pdf";
import type { FinancialDocumentRecord, FinancialDocumentStatus, FinancialDocumentType } from "@/modules/documents/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type DeliveryRow = {
  id: string; organization_id: string; document_id: string; tenant_id: string;
  recipient_email: string; status: "pending" | "failed"; attempt_count: number;
};

type DocumentRow = {
  id: string; organization_id: string; tenant_id: string; lease_id: string | null; due_id: string | null;
  payment_id: string | null; document_type: FinancialDocumentType; reference: string;
  status: FinancialDocumentStatus; language: "fr" | "en"; issued_on: string; period_start: string | null;
  period_end: string | null; snapshot: Record<string, unknown>; template_version: string;
  storage_path: string | null; created_by: string | null; created_at: string;
  invalidated_at: string | null; invalidation_reason: string | null;
};

function record(row: DocumentRow): FinancialDocumentRecord {
  return { id: row.id, organizationId: row.organization_id, tenantId: row.tenant_id, leaseId: row.lease_id,
    dueId: row.due_id, paymentId: row.payment_id, type: row.document_type, reference: row.reference,
    status: row.status, language: row.language, issuedOn: row.issued_on, periodStart: row.period_start,
    periodEnd: row.period_end, snapshot: row.snapshot, templateVersion: row.template_version,
    storagePath: row.storage_path, createdBy: row.created_by, createdAt: row.created_at,
    invalidatedAt: row.invalidated_at, invalidationReason: row.invalidation_reason, lastDelivery: null };
}

function retryAt(attempt: number) {
  const minutes = [5, 30, 120][Math.min(Math.max(attempt - 1, 0), 2)];
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export async function GET(request: NextRequest) {
  if (process.env.KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED !== "true") {
    return NextResponse.json({ enabled: false, processed: 0, message: "financial_email_delivery_disabled" });
  }
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  const resendKey = process.env.RESEND_TRANSACTIONAL_API_KEY?.trim();
  const from = process.env.KJORA_TRANSACTIONAL_EMAIL_FROM?.trim();
  if (!url || !secretKey || !resendKey || !from) return NextResponse.json({ error: "worker_configuration_missing" }, { status: 503 });

  const supabase = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString();
  const deliveryResult = await supabase.from("message_deliveries").select("id, organization_id, document_id, tenant_id, recipient_email, status, attempt_count")
    .in("status", ["pending", "failed"]).lte("next_attempt_at", now).lt("attempt_count", 3)
    .order("created_at").limit(5);
  if (deliveryResult.error) return NextResponse.json({ error: "delivery_queue_unavailable" }, { status: 500 });
  let sent = 0; let failed = 0; let cancelled = 0;

  for (const delivery of (deliveryResult.data ?? []) as DeliveryRow[]) {
    const attempt = delivery.attempt_count + 1;
    const claimed = await supabase.from("message_deliveries").update({ status: "processing", attempt_count: attempt, updated_at: now })
      .eq("id", delivery.id).in("status", ["pending", "failed"]).select("id").maybeSingle();
    if (claimed.error || !claimed.data) continue;
    try {
      const documentResult = await supabase.from("financial_documents").select("*").eq("id", delivery.document_id).maybeSingle();
      if (documentResult.error || !documentResult.data) throw new Error("document_unavailable");
      const document = record(documentResult.data as DocumentRow);
      if (document.status === "invalidated") {
        await supabase.from("message_deliveries").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", delivery.id);
        cancelled += 1; continue;
      }
      const bytes = await generateFinancialDocumentPdf(document);
      if (!document.storagePath) {
        const storagePath = `${document.organizationId}/${document.id}/v1.pdf`;
        const upload = await supabase.storage.from("financial-documents").upload(storagePath, bytes, {
          contentType: "application/pdf", cacheControl: "31536000", upsert: false,
        });
        if (upload.error && !upload.error.message.toLowerCase().includes("exist")) throw upload.error;
        const finalized = await supabase.rpc("finalize_financial_document_system", {
          target_document_id: document.id, target_storage_path: storagePath,
          target_content_sha256: createHash("sha256").update(bytes).digest("hex"),
          target_content_bytes: bytes.byteLength,
        });
        if (finalized.error) throw finalized.error;
      }
      const email = financialDocumentEmail(document);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [delivery.recipient_email], subject: email.subject, html: email.html,
          text: email.text, attachments: [{ filename: `${document.reference}.pdf`, content: Buffer.from(bytes).toString("base64") }] }),
      });
      const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
      if (!response.ok || !payload.id) throw new Error(`resend_${response.status}:${payload.message ?? "delivery_failed"}`);
      await supabase.from("message_deliveries").update({ status: "sent", provider: "resend", provider_message_id: payload.id,
        sent_at: new Date().toISOString(), next_attempt_at: null, last_error_code: null, last_error_message: null,
        updated_at: new Date().toISOString() }).eq("id", delivery.id);
      sent += 1;
    } catch (error) {
      const controlled = controlledDeliveryError(error);
      const exhausted = attempt >= 3;
      await supabase.from("message_deliveries").update({ status: "failed", next_attempt_at: exhausted ? null : retryAt(attempt),
        last_error_code: exhausted ? "delivery_exhausted" : "delivery_retryable", last_error_message: controlled,
        updated_at: new Date().toISOString() }).eq("id", delivery.id);
      if (exhausted) {
        await supabase.rpc("record_financial_delivery_failure_system", { target_delivery_id: delivery.id });
      }
      failed += 1;
    }
  }
  return NextResponse.json({ enabled: true, processed: sent + failed + cancelled, sent, failed, cancelled });
}
