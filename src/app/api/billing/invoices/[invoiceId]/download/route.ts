import { NextResponse } from "next/server";
import { getActiveAuthorization } from "@/core/authorization/server";
import { getBillingInvoiceForDownload } from "@/core/billing/server";
import { generateBillingInvoicePdf } from "@/core/billing/invoice-pdf";
import { BILLING_CYCLE_LABELS } from "@/core/billing/model";
import { PLAN_LABELS } from "@/core/entitlements/model";

// REVENUE-01D — Téléchargement facture/reçu d'abonnement (Owner, capability
// billing.view). Réservé aux factures XAF (REVENUE-01B, facturation manuelle
// Afrique) : `invoice-pdf.ts` ne représente que ce domaine, jamais un
// paiement Canada (architecture préparée pour un fournisseur, aucun appel
// réel, aucune activation).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const [{ invoiceId }, authorization] = await Promise.all([params, getActiveAuthorization()]);
  if (!authorization?.capabilities.includes("billing.view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!invoiceId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const invoice = await getBillingInvoiceForDownload(authorization.organizationId, invoiceId);
  if (!invoice) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (invoice.currency !== "XAF") {
    // Aucun document imprimable pour une facture Canada/CAD à ce stade :
    // aucun fournisseur de paiement en ligne n'est activé, donc aucune
    // facture réelle n'existe encore dans ce cas (voir REVENUE-LAUNCH-01,
    // décisions verrouillées).
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  const language = new URL(request.url).searchParams.get("lang") === "en" ? "en" : "fr";
  const bytes = await generateBillingInvoicePdf({
    organizationName: invoice.organizationName,
    number: invoice.number,
    plan: invoice.plan,
    planLabel: PLAN_LABELS[invoice.plan][language],
    billingCycleLabel: language === "en"
      ? (invoice.billingCycle === "annual" ? "Annual" : "Monthly")
      : BILLING_CYCLE_LABELS[invoice.billingCycle],
    currency: "XAF",
    amountMinor: invoice.amountMinor,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    issuedOn: invoice.issuedOn,
    status: invoice.status,
    paidAt: invoice.paidAt,
    manualReference: invoice.manualReference,
    language,
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${invoice.number}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
