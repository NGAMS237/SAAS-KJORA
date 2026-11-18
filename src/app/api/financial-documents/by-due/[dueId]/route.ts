import { NextResponse } from "next/server";
import { getActiveAuthorization } from "@/core/authorization/server";
import { financialDocumentFileName, pdfContentDisposition } from "@/modules/documents/model";
import { findDueNoticeDocument, getTenantDisplayName, readFinancialDocumentBytes } from "@/modules/documents/server";
import { UUID_PATTERN } from "@/modules/properties/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PDF de l'avis d'échéance d'une échéance (pour la relance WhatsApp : le fichier est joint au message).
// Seul un avis approuvé est renvoyé ; sinon 404 / 409 et la relance part sans pièce jointe.
export async function GET(_request: Request, { params }: { params: Promise<{ dueId: string }> }) {
  const [{ dueId }, authorization] = await Promise.all([params, getActiveAuthorization()]);
  if (!authorization || !UUID_PATTERN.test(dueId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!authorization.capabilities.includes("due.view")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const document = await findDueNoticeDocument(authorization.organizationId, dueId);
  if (!document) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (document.reviewStatus !== undefined && document.reviewStatus !== "approved") return NextResponse.json({ error: "document_review_required" }, { status: 409 });
  const bytes = await readFinancialDocumentBytes(document);
  const fileName = financialDocumentFileName(document, await getTenantDisplayName(authorization.organizationId, document.tenantId));
  return new NextResponse(Buffer.from(bytes), { headers: {
    "content-type": "application/pdf", "content-disposition": pdfContentDisposition("inline", fileName),
    "cache-control": "private, no-store", "x-file-name": encodeURIComponent(fileName),
  } });
}
