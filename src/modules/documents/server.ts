import "server-only";

import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  FinancialDocumentRecord,
  FinancialDocumentStatus,
  FinancialDocumentSummary,
  FinancialDocumentType,
  NotificationSummary,
} from "@/modules/documents/model";
import { generateFinancialDocumentPdf } from "@/modules/documents/pdf";

type DocumentRow = {
  id: string; organization_id: string; tenant_id: string; lease_id: string | null;
  due_id: string | null; payment_id: string | null; document_type: FinancialDocumentType;
  reference: string; status: FinancialDocumentStatus; language: "fr" | "en"; issued_on: string;
  period_start: string | null; period_end: string | null; snapshot: Record<string, unknown>;
  template_version: string; storage_path: string | null; created_by: string | null;
  created_at: string; invalidated_at: string | null; invalidation_reason: string | null;
};
type TenantDocumentContactRow = { tenant_id: string; email: string | null };

const DOCUMENT_COLUMNS = "id, organization_id, tenant_id, lease_id, due_id, payment_id, document_type, reference, status, language, issued_on, period_start, period_end, snapshot, template_version, storage_path, created_by, created_at, invalidated_at, invalidation_reason";

function documentRecord(row: DocumentRow): FinancialDocumentRecord {
  return {
    id: row.id, organizationId: row.organization_id, tenantId: row.tenant_id,
    leaseId: row.lease_id, dueId: row.due_id, paymentId: row.payment_id,
    type: row.document_type, reference: row.reference, status: row.status, language: row.language,
    issuedOn: row.issued_on, periodStart: row.period_start, periodEnd: row.period_end,
    snapshot: row.snapshot, templateVersion: row.template_version, storagePath: row.storage_path,
    createdBy: row.created_by, createdAt: row.created_at, invalidatedAt: row.invalidated_at,
    invalidationReason: row.invalidation_reason,
    tenantEmail: null,
    lastDelivery: null,
  };
}

function summary(row: DocumentRow, tenantEmail: string | null = null): FinancialDocumentSummary {
  return {
    id: row.id, tenantId: row.tenant_id, leaseId: row.lease_id, dueId: row.due_id,
    paymentId: row.payment_id, type: row.document_type, reference: row.reference,
    status: row.status, language: row.language, issuedOn: row.issued_on,
    periodStart: row.period_start, periodEnd: row.period_end, storagePath: row.storage_path,
    createdAt: row.created_at, invalidatedAt: row.invalidated_at, invalidationReason: row.invalidation_reason,
    tenantEmail,
    lastDelivery: null,
  };
}

export async function getFinancialDocuments(
  organizationId: string,
  filter: { tenantId?: string; leaseId?: string; paymentId?: string } = {},
) {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("financial_documents").select(DOCUMENT_COLUMNS)
    .eq("organization_id", organizationId).order("issued_on", { ascending: false })
    .order("created_at", { ascending: false }).limit(200);
  if (filter.tenantId) query = query.eq("tenant_id", filter.tenantId);
  if (filter.leaseId) query = query.eq("lease_id", filter.leaseId);
  if (filter.paymentId) query = query.eq("payment_id", filter.paymentId);
  const result = await query;
  if (result.error) throw result.error;
  const rows = (result.data ?? []) as DocumentRow[];
  if (!rows.length) return [];
  // Email actuel du locataire — permet à l'UI de détecter l'absence d'email
  // AVANT même de tenter un envoi (§9), sans dépendre de l'historique de
  // livraison (qui peut être vide ou pointer vers une adresse obsolète).
  const requestedTenantIds = Array.from(new Set(rows.map((row) => row.tenant_id)));
  const tenantEmails = await supabase.rpc("list_tenant_document_contacts", {
    target_organization_id: organizationId,
    target_tenant_ids: requestedTenantIds,
  });
  if (tenantEmails.error) throw tenantEmails.error;
  const requestedTenantIdSet = new Set(requestedTenantIds);
  const emailByTenant = new Map(((tenantEmails.data ?? []) as TenantDocumentContactRow[])
    .filter((tenant) => requestedTenantIdSet.has(tenant.tenant_id))
    .map((tenant) => [tenant.tenant_id, tenant.email]));
  const documents = rows.map((row) => summary(row, emailByTenant.get(row.tenant_id) ?? null));
  const deliveries = await supabase.from("message_deliveries")
    .select("document_id, status, recipient_email, attempt_count, sent_at, last_error_code, created_at")
    .eq("organization_id", organizationId).in("document_id", documents.map((document) => document.id))
    .order("created_at", { ascending: false });
  if (deliveries.error) throw deliveries.error;
  const latestByDocument = new Map<string, FinancialDocumentSummary["lastDelivery"]>();
  for (const delivery of deliveries.data ?? []) {
    if (latestByDocument.has(delivery.document_id)) continue;
    latestByDocument.set(delivery.document_id, {
      status: delivery.status as NonNullable<FinancialDocumentSummary["lastDelivery"]>["status"],
      recipientEmail: delivery.recipient_email, attemptCount: Number(delivery.attempt_count),
      sentAt: delivery.sent_at, lastErrorCode: delivery.last_error_code, createdAt: delivery.created_at,
    });
  }
  return documents.map((document) => ({ ...document, lastDelivery: latestByDocument.get(document.id) ?? null }));
}

export async function getFinancialDocument(organizationId: string, documentId: string) {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.from("financial_documents").select(DOCUMENT_COLUMNS)
    .eq("organization_id", organizationId).eq("id", documentId).maybeSingle();
  if (result.error) throw result.error;
  return result.data ? documentRecord(result.data as DocumentRow) : null;
}

export async function materializeFinancialDocument(document: FinancialDocumentRecord) {
  const supabase = await createSupabaseServerClient();
  if (document.storagePath) return document.storagePath;
  const bytes = await generateFinancialDocumentPdf(document);
  if (document.status === "invalidated") return { bytes } as const;
  const storagePath = `${document.organizationId}/${document.id}/v1.pdf`;
  const upload = await supabase.storage.from("financial-documents").upload(storagePath, bytes, {
    contentType: "application/pdf", cacheControl: "31536000", upsert: false,
  });
  if (upload.error && !upload.error.message.toLowerCase().includes("exist")) throw upload.error;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const finalized = await supabase.rpc("finalize_financial_document", {
    target_document_id: document.id,
    target_storage_path: storagePath,
    target_content_sha256: sha256,
    target_content_bytes: bytes.byteLength,
  });
  if (finalized.error) throw finalized.error;
  return storagePath;
}

export async function createFinancialDocumentSignedUrl(storagePath: string) {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.storage.from("financial-documents").createSignedUrl(storagePath, 120, { download: true });
  if (result.error) throw result.error;
  return result.data.signedUrl;
}

export async function getNotifications(organizationId: string): Promise<NotificationSummary[]> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.from("notifications")
    .select("id, notification_type, title_code, payload, document_id, tenant_id, lease_id, read_at, created_at")
    .eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100);
  if (result.error) throw result.error;
  return (result.data ?? []).map((row) => ({
    id: row.id, type: row.notification_type as NotificationSummary["type"], titleCode: row.title_code,
    payload: row.payload as Record<string, unknown>, documentId: row.document_id,
    tenantId: row.tenant_id, leaseId: row.lease_id, readAt: row.read_at, createdAt: row.created_at,
  }));
}
