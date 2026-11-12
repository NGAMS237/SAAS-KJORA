import { NextResponse } from "next/server";
import { getActiveAuthorization } from "@/core/authorization/server";
import { parseContractId } from "@/modules/contracts/model";
import { getLeaseContract, renderContractPreviewPdf } from "@/modules/contracts/server";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

// Aperçu PDF du contrat (tous statuts) avec la fiche bailleur : logo, signature et cachet.
// Le PDF final signé reste celui figé dans le stockage (téléchargement séparé).
export async function GET(_request: Request, { params }: { params: Promise<{ contractId: string }> }) {
  const [{ contractId }, authorization] = await Promise.all([params, getActiveAuthorization()]);
  if (!authorization?.capabilities.includes("contract.manage") || !parseContractId(contractId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const contract = await getLeaseContract(authorization.organizationId, contractId);
  if (!contract || contract.status === "cancelled") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const bytes = await renderContractPreviewPdf(contract);
  return new NextResponse(Buffer.from(bytes), { headers: {
    "content-type": "application/pdf", "content-disposition": `inline; filename="${contract.reference}-apercu.pdf"`,
    "cache-control": "private, no-store", "x-content-type-options": "nosniff",
  } });
}
