import { notFound } from "next/navigation";
import { getActiveAuthorization } from "@/core/authorization/server";
import { getBillingOverview, listBillingInvoices } from "@/core/billing/server";
import { BillingView } from "@/core/billing/billing-view";

// Abonnement & facturation — réservé à l'Organization Owner (capability billing.view).
// Cette surface reste accessible même lorsque le compte est bloqué : c'est
// précisément depuis ici que le blocage se résout.
export default async function BillingPage() {
  const authorization = await getActiveAuthorization();
  if (!authorization?.capabilities.includes("billing.view")) notFound();

  const [overview, invoices] = await Promise.all([
    getBillingOverview(authorization.organizationId),
    listBillingInvoices(authorization.organizationId),
  ]);

  if (!overview) notFound();

  return <BillingView invoices={invoices} overview={overview} />;
}
