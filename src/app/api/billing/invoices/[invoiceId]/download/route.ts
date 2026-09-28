import { NextResponse } from "next/server";
import { getActiveAuthorization } from "@/core/authorization/server";
import { renderBillingInvoiceDownload } from "@/core/billing/invoice-download";

// REVENUE-01D — Téléchargement facture/reçu d'abonnement (Owner, capability
// billing.view). Réservé aux factures XAF (REVENUE-01B, facturation manuelle
// Afrique) : `invoice-pdf.ts` ne représente que ce domaine, jamais un
// paiement Canada (architecture préparée pour un fournisseur, aucun appel
// réel, aucune activation). Génération partagée : core/billing/invoice-download.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const [{ invoiceId }, authorization] = await Promise.all([params, getActiveAuthorization()]);
  if (!authorization?.capabilities.includes("billing.view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const language = new URL(request.url).searchParams.get("lang") === "en" ? "en" : "fr";
  return renderBillingInvoiceDownload(authorization.organizationId, invoiceId, language);
}
