import { NextResponse } from "next/server";
import { getActiveAuthorization } from "@/core/authorization/server";
import { financialDocumentFileName, parseDocumentId, pdfContentDisposition } from "@/modules/documents/model";
import { getFinancialDocument, getTenantDisplayName, readFinancialDocumentBytes } from "@/modules/documents/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Octets du PDF d'un document approuvé, servis directement (sans redirection) : utilisé pour joindre
// le fichier à un message WhatsApp depuis l'application.
export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const [{ documentId }, authorization] = await Promise.all([params, getActiveAuthorization()]);
  if (!authorization || !parseDocumentId(documentId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const document = await getFinancialDocument(authorization.organizationId, documentId);
  if (!document || document.status === "invalidated") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const required = document.type === "payment_receipt" || document.type === "rent_receipt" ? "receipt.view" : "due.view";
  if (!authorization.capabilities.includes(required)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (document.reviewStatus !== undefined && document.reviewStatus !== "approved") return NextResponse.json({ error: "document_review_required" }, { status: 409 });
  const bytes = await readFinancialDocumentBytes(document);
  const fileName = financialDocumentFileName(document, await getTenantDisplayName(authorization.organizationId, document.tenantId));
  return new NextResponse(Buffer.from(bytes), { headers: {
    "content-type": "application/pdf", "content-disposition": pdfContentDisposition("inline", fileName),
    "cache-control": "private, no-store", "x-file-name": encodeURIComponent(fileName),
  } });
}
