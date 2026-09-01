import "server-only";

import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  PortalAccessOption,
  PortalAccessStatus,
  PortalDocument,
  PortalDue,
  PortalHome,
  PortalPayment,
} from "@/tenant-portal/model";

export const ACTIVE_PORTAL_ACCESS_COOKIE = "kjora-active-portal-access";

function accessOption(row: Record<string, unknown>): PortalAccessOption {
  return {
    accessId: String(row.access_id), organizationId: String(row.organization_id),
    organizationName: String(row.organization_name), tenantId: String(row.tenant_id),
    tenantName: String(row.tenant_name), preferredLanguage: row.preferred_language === "en" ? "en" : "fr",
    lastLoginAt: typeof row.last_login_at === "string" ? row.last_login_at : null,
    leaseCount: Number(row.lease_count),
  };
}

export async function loadPortalContext() {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claimsData?.claims?.sub !== "string") return null;
  const { data, error } = await supabase.rpc("list_my_tenant_portal_accesses");
  if (error) return null;
  const accesses = ((data ?? []) as Record<string, unknown>[]).map(accessOption);
  const requested = (await cookies()).get(ACTIVE_PORTAL_ACCESS_COOKIE)?.value;
  const activeAccess = accesses.find((access) => access.accessId === requested) ?? accesses[0] ?? null;
  return { userId: claimsData.claims.sub, userEmail: String(claimsData.claims.email ?? ""), accesses, activeAccess };
}

export async function getPortalHome(accessId: string): Promise<PortalHome> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_tenant_portal_home", { target_access_id: accessId });
  if (error || !data) throw error ?? new Error("portal_not_found");
  return data as PortalHome;
}

export async function getPortalDues(accessId: string, leaseId: string): Promise<PortalDue[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_tenant_portal_dues", {
    target_access_id: accessId, target_lease_id: leaseId, result_limit: 100,
  });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    dueId: String(row.due_id), kind: row.kind as PortalDue["kind"], reference: String(row.reference),
    periodStart: String(row.period_start), periodEnd: String(row.period_end), dueDate: String(row.due_date),
    rentXaf: Number(row.rent_xaf), chargesXaf: Number(row.charges_xaf), depositXaf: Number(row.deposit_xaf),
    totalXaf: Number(row.total_xaf), creditAppliedXaf: Number(row.credit_applied_xaf),
    paymentsReceivedXaf: Number(row.payments_received_xaf), remainingXaf: Number(row.remaining_xaf),
    status: String(row.status),
  }));
}

export async function getPortalPayments(accessId: string, leaseId: string): Promise<PortalPayment[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_tenant_portal_payments", {
    target_access_id: accessId, target_lease_id: leaseId, result_limit: 100,
  });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    paymentId: String(row.payment_id), reference: String(row.reference), amountXaf: Number(row.amount_xaf),
    paymentDate: String(row.payment_date), method: String(row.method),
    status: row.status as PortalPayment["status"],
    externalReference: typeof row.external_reference === "string" ? row.external_reference : null,
    allocations: (Array.isArray(row.allocations) ? row.allocations : []) as PortalPayment["allocations"],
  }));
}

export async function getPortalDocuments(accessId: string, leaseId: string): Promise<PortalDocument[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_tenant_portal_documents", {
    target_access_id: accessId, target_lease_id: leaseId, result_limit: 100,
  });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    documentId: String(row.document_id), documentType: row.document_type as PortalDocument["documentType"],
    reference: String(row.reference), status: row.status as PortalDocument["status"], issuedOn: String(row.issued_on),
    periodStart: typeof row.period_start === "string" ? row.period_start : null,
    periodEnd: typeof row.period_end === "string" ? row.period_end : null, viewed: Boolean(row.viewed),
  }));
}

export async function getPortalAccessStatus(tenantId: string): Promise<PortalAccessStatus | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_tenant_portal_access_status", { target_tenant_id: tenantId });
  if (error) throw error;
  const row = (data?.[0] ?? null) as Record<string, unknown> | null;
  if (!row) return null;
  return {
    accessId: String(row.access_id), status: row.status as PortalAccessStatus["status"],
    invitedEmail: String(row.invited_email), invitedAt: String(row.invited_at),
    acceptedAt: typeof row.accepted_at === "string" ? row.accepted_at : null,
    revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null,
    lastLoginAt: typeof row.last_login_at === "string" ? row.last_login_at : null,
    invitationId: typeof row.invitation_id === "string" ? row.invitation_id : null,
    invitationStatus: (row.invitation_status as PortalAccessStatus["invitationStatus"]) ?? null,
    invitationExpiresAt: typeof row.invitation_expires_at === "string" ? row.invitation_expires_at : null,
    leaseIds: Array.isArray(row.lease_ids) ? row.lease_ids.map(String) : [],
  };
}
