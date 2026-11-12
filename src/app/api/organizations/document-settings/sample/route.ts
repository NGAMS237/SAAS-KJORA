import { NextResponse } from "next/server";
import { getActiveAuthorization } from "@/core/authorization/server";
import { getDocumentBranding } from "@/modules/documents/branding-server";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";
import { buildSampleDocument } from "@/modules/documents/sample";
import { generateFinancialDocumentPdf } from "@/modules/documents/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Exemple d'avis ou de quittance avec les informations bailleur enregistrées (données fictives).
export async function GET(request: Request) {
  const authorization = await getActiveAuthorization();
  if (!authorization) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const type = new URL(request.url).searchParams.get("type") === "rent_receipt" ? "rent_receipt" : "due_notice";
  const [{ branding }, context] = await Promise.all([getDocumentBranding(authorization.organizationId), loadOrganizationContext()]);
  const bytes = await generateFinancialDocumentPdf(buildSampleDocument(type, new Date(), context.activeOrganization?.name || "Votre organisation"), { branding, tenantCivility: "M.", arrearsXaf: type === "due_notice" ? 54_000 : 0 });
  return new NextResponse(Buffer.from(bytes), { headers: {
    "content-type": "application/pdf",
    "content-disposition": `inline; filename="exemple-${type === "due_notice" ? "avis" : "quittance"}.pdf"`,
    "cache-control": "private, no-store",
  } });
}
