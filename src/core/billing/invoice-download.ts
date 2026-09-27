import "server-only";

import { NextResponse } from "next/server";
import { getBillingInvoiceForDownload } from "@/core/billing/server";
import { generateBillingInvoicePdf } from "@/core/billing/invoice-pdf";
import { resolveBillingLegalIdentity } from "@/core/billing/legal-identity";
import { BILLING_CYCLE_LABELS } from "@/core/billing/model";
import { PLAN_LABELS } from "@/core/entitlements/model";

// REVENUE-01D — Génération de la facture/reçu d'abonnement, partagée par la
// route Owner (/api/billing/invoices/[invoiceId]/download) et par le contexte
// limité d'une Organization suspendue (/api/organisation-suspendue/...).
//
// L'autorisation réelle est portée en base par list_billing_invoices
// (private.can_read_billing : billing.view, ou exception étroite d'une
// Organization SUSPENDUE ; jamais pour une Organization archivée) : un appel
// non autorisé renvoie simplement « introuvable ».
//
// Réservé aux factures XAF (REVENUE-01B). L'émetteur légal vient de la
// configuration serveur (legal-identity.ts), jamais d'une valeur codée.
export async function renderBillingInvoiceDownload(
  organizationId: string,
  invoiceId: string,
  language: "fr" | "en",
): Promise<NextResponse> {
  if (!invoiceId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const invoice = await getBillingInvoiceForDownload(organizationId, invoiceId);
  if (!invoice) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (invoice.currency !== "XAF") {
    // Aucun document imprimable pour une facture Canada/CAD à ce stade.
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

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
    dueOn: invoice.dueOn,
    issuedOn: invoice.issuedOn,
    status: invoice.status,
    paidAt: invoice.paidAt,
    manualReference: invoice.manualReference,
    issuer: resolveBillingLegalIdentity(process.env),
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
