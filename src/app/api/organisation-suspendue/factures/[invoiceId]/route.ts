import { NextResponse } from "next/server";
import { resolveMyRestrictedOrganization } from "@/core/organization/restricted-organizations";
import { renderBillingInvoiceDownload } from "@/core/billing/invoice-download";

// REVENUE-LAUNCH-01 v3 — Facture/reçu d'une Organization SUSPENDUE, depuis le
// contexte limité. Double barrière : (1) l'Organization demandée doit figurer
// parmi les Organizations restreintes de l'appelant avec la lecture de
// facturation effective (calculée en base) ; (2) list_billing_invoices
// revérifie private.can_read_billing. Jamais disponible pour une Organization
// archivée (aucune exception).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const url = new URL(request.url);
  const { selected } = await resolveMyRestrictedOrganization(url.searchParams.get("organization"));
  if (!selected || selected.id !== url.searchParams.get("organization")
    || selected.status !== "suspended" || !selected.canViewBilling) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const language = url.searchParams.get("lang") === "en" ? "en" : "fr";
  return renderBillingInvoiceDownload(selected.id, invoiceId, language);
}
