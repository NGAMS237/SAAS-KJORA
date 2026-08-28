import { NextResponse } from "next/server";
import { getActiveAuthorization } from "@/core/authorization/server";
import { parseDocumentId } from "@/modules/documents/model";
import { createFinancialDocumentSignedUrl, getFinancialDocument, materializeFinancialDocument } from "@/modules/documents/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const [{ documentId }, authorization] = await Promise.all([params, getActiveAuthorization()]);
  if (!authorization || !parseDocumentId(documentId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const document = await getFinancialDocument(authorization.organizationId, documentId);
  if (!document) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const required = document.type === "payment_receipt" || document.type === "rent_receipt" ? "receipt.view" : "due.view";
  if (!authorization.capabilities.includes(required)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const artifact = await materializeFinancialDocument(document);
  if (typeof artifact !== "string") {
    return new NextResponse(Buffer.from(artifact.bytes), {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${document.reference}.pdf"`, "cache-control": "private, no-store" },
    });
  }
  const signedUrl = await createFinancialDocumentSignedUrl(artifact);
  return NextResponse.redirect(signedUrl, { headers: { "cache-control": "private, no-store" } });
}
