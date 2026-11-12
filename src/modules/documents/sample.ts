// Document fictif utilisé pour l'aperçu des informations bailleur (jamais enregistré).
import type { FinancialDocumentRecord } from "./model.ts";

export function buildSampleDocument(type: "due_notice" | "rent_receipt", today = new Date()): FinancialDocumentRecord {
  const year = today.getUTCFullYear();
  const month = String(today.getUTCMonth() + 1).padStart(2, "0");
  const lastDay = String(new Date(Date.UTC(year, today.getUTCMonth() + 1, 0)).getUTCDate()).padStart(2, "0");
  const start = `${year}-${month}-01`;
  return {
    id: "00000000-0000-4000-8000-000000000000", organizationId: "00000000-0000-4000-8000-000000000000",
    tenantId: "00000000-0000-4000-8000-000000000000", leaseId: null, dueId: null, paymentId: null,
    type, reference: type === "due_notice" ? "EXEMPLE-AVIS" : "EXEMPLE-QUITTANCE", status: "prepared",
    reviewStatus: "approved", deferredUntil: null, language: "fr", issuedOn: start,
    periodStart: start, periodEnd: `${year}-${month}-${lastDay}`, storagePath: null, createdAt: start,
    invalidatedAt: null, invalidationReason: null, tenantEmail: null, lastDelivery: null,
    templateVersion: "exemple", createdBy: null,
    snapshot: {
      organization_name: "Votre organisation", tenant_name: "Jean Exemple", property_name: "Résidence exemple",
      property_locality: "Yaoundé", unit_label: "Studio A1", period_start: start, period_end: `${year}-${month}-${lastDay}`,
      due_date: `${year}-${month}-05`, rent_xaf: 25_000, recurring_charges_xaf: 2_000, expected_xaf: 27_000,
      credit_applied_xaf: 0, payment_allocated_xaf: 0, remaining_xaf: 27_000,
    },
  };
}
