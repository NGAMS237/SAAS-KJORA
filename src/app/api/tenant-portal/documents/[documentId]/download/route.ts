import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parseDocumentId, type FinancialDocumentRecord } from "@/modules/documents/model";
import { generateFinancialDocumentPdf } from "@/modules/documents/pdf";
import { loadDocumentRenderContext } from "@/modules/documents/render-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ACTIVE_PORTAL_ACCESS_COOKIE } from "@/tenant-portal/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const documentId = parseDocumentId((await params).documentId);
  const accessId = (await cookies()).get(ACTIVE_PORTAL_ACCESS_COOKIE)?.value;
  if (!documentId || !accessId) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("get_tenant_portal_document", { target_access_id: accessId, target_document_id: documentId });
  const row = result.data?.[0] as Record<string, unknown> | undefined;
  if (result.error || !row || row.status === "invalidated") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const document: FinancialDocumentRecord = {
    id: String(row.document_id), organizationId: String(row.organization_id), tenantId: String(row.tenant_id),
    leaseId: typeof row.lease_id === "string" ? row.lease_id : null,
    dueId: typeof row.due_id === "string" ? row.due_id : null,
    paymentId: typeof row.payment_id === "string" ? row.payment_id : null,
    type: row.document_type as FinancialDocumentRecord["type"], status: row.status as FinancialDocumentRecord["status"],
    reference: String(row.reference), language: row.language === "en" ? "en" : "fr", issuedOn: String(row.issued_on),
    periodStart: typeof row.period_start === "string" ? row.period_start : null,
    periodEnd: typeof row.period_end === "string" ? row.period_end : null,
    snapshot: row.snapshot as Record<string, unknown>, templateVersion: String(row.template_version),
    storagePath: typeof row.storage_path === "string" ? row.storage_path : null,
    createdBy: typeof row.created_by === "string" ? row.created_by : null, createdAt: String(row.created_at),
    invalidatedAt: typeof row.invalidated_at === "string" ? row.invalidated_at : null,
    invalidationReason: typeof row.invalidation_reason === "string" ? row.invalidation_reason : null,
    tenantEmail: null,
    lastDelivery: null,
  };
  async function recordReceiptView() {
    if (document.type !== "payment_receipt" && document.type !== "rent_receipt") return true;
    const viewed = await supabase.rpc("mark_tenant_portal_document_viewed", { target_access_id: accessId, target_document_id: documentId });
    return !viewed.error;
  }
  if (document.storagePath) {
    const signed = await supabase.storage.from("financial-documents").createSignedUrl(document.storagePath, 120, { download: `${document.reference}.pdf` });
    if (signed.error) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!await recordReceiptView()) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.redirect(signed.data.signedUrl, { headers: { "cache-control": "private, no-store" } });
  }
  const bytes = await generateFinancialDocumentPdf(document, await loadDocumentRenderContext(supabase, document.id, accessId));
  if (!await recordReceiptView()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new NextResponse(Buffer.from(bytes), { headers: {
    "content-type": "application/pdf", "content-disposition": `inline; filename="${document.reference}.pdf"`,
    "cache-control": "private, no-store",
  } });
}
