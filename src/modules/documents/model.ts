import { UUID_PATTERN } from "../properties/model.ts";

export const FINANCIAL_DOCUMENT_TYPES = [
  "due_notice",
  "payment_receipt",
  "rent_receipt",
  "account_statement",
] as const;

export type FinancialDocumentType = (typeof FINANCIAL_DOCUMENT_TYPES)[number];
export type FinancialDocumentStatus = "prepared" | "ready" | "invalidated";
export type FinancialDocumentReviewStatus = "draft" | "approved" | "deferred";

export type FinancialDocumentSummary = {
  id: string;
  tenantId: string;
  leaseId: string | null;
  dueId: string | null;
  paymentId: string | null;
  type: FinancialDocumentType;
  reference: string;
  status: FinancialDocumentStatus;
  /** Absent only for legacy projections; legacy ready documents are approved. */
  reviewStatus?: FinancialDocumentReviewStatus;
  deferredUntil?: string | null;
  language: "fr" | "en";
  issuedOn: string;
  periodStart: string | null;
  periodEnd: string | null;
  storagePath: string | null;
  createdAt: string;
  invalidatedAt: string | null;
  invalidationReason: string | null;
  /** Email actuel du locataire (peut différer de lastDelivery.recipientEmail, historique) — utilisé pour détecter côté client l'absence d'email avant même d'appeler le serveur (§9). */
  tenantEmail: string | null;
  lastDelivery: {
    status: "pending" | "processing" | "sent" | "delivered" | "failed" | "delivery_unknown" | "provider_failed"
      | "bounced" | "complained" | "suppressed" | "cancelled";
    recipientEmail: string;
    attemptCount: number;
    sentAt: string | null;
    lastErrorCode: string | null;
    createdAt: string;
  } | null;
};

export type FinancialDocumentRecord = FinancialDocumentSummary & {
  organizationId: string;
  snapshot: Record<string, unknown>;
  templateVersion: string;
  createdBy: string | null;
};

export type NotificationSummary = {
  id: string;
  type: "due_notice_ready" | "payment_receipt_ready" | "rent_receipt_ready" | "payment_overdue"
    | "last_prepaid_period" | "low_credit" | "delivery_failed" | "contract_ready" | "contract_completed";
  titleCode: string;
  payload: Record<string, unknown>;
  documentId: string | null;
  tenantId: string | null;
  leaseId: string | null;
  /** NCE-01 : contexte d'affichage (jamais une adresse électronique). */
  tenantName: string | null;
  propertyName: string | null;
  unitLabel: string | null;
  readAt: string | null;
  createdAt: string;
};

export function parseStatementRequest(input: Record<string, unknown>) {
  const tenantId = typeof input.tenantId === "string" ? input.tenantId : "";
  const from = typeof input.from === "string" && input.from ? input.from : null;
  const to = typeof input.to === "string" && input.to ? input.to : null;
  if (!UUID_PATTERN.test(tenantId)) return { ok: false as const, error: "invalid_tenant" };
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
    return { ok: false as const, error: "invalid_statement_period" };
  }
  if (from && to && to < from) return { ok: false as const, error: "invalid_statement_period" };
  return { ok: true as const, value: { tenantId, from, to } };
}

export function parseDocumentId(value: unknown) {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}
