// IMPORT-01 — traduction d'une ligne finalisée de l'assistant (après
// résolution des doublons, §7 étape 6) en payload pour la RPC
// `commit_data_import`. Module pur, sans accès réseau/DB : utilisable aussi
// bien côté client (le composant assistant construit le payload avant de
// l'envoyer à /api/data-import/commit) que côté serveur.

import type { CommitRowPayload, DuplicateResolution, NormalizedLeaseRow } from "./model.ts";

export type FinalizedRowInput = {
  rowNumber: number;
  skip: boolean;
  row: NormalizedLeaseRow;
  duplicateResolutions: Partial<Record<"property" | "unit" | "tenant", { resolution: DuplicateResolution; existingId: string | null }>>;
};

export function buildCommitPayload(rows: FinalizedRowInput[]): CommitRowPayload[] {
  return rows.map((entry) => {
    if (entry.skip) return { skip: true };
    const row = entry.row;
    const propertyResolution = entry.duplicateResolutions.property;
    const unitResolution = entry.duplicateResolutions.unit;
    const tenantResolution = entry.duplicateResolutions.tenant;

    const payload: CommitRowPayload = {
      property: {
        action: propertyResolution?.resolution === "associate" ? "associate" : "create",
        type: row.property.type ?? "house",
        ...(propertyResolution?.resolution === "associate" && propertyResolution.existingId
          ? { existing_id: propertyResolution.existingId }
          : { fingerprint: row.property.fingerprint ?? undefined, name: row.property.name ?? undefined, locality: row.property.locality ?? undefined }),
      },
      unit: row.property.type === "house"
        ? { action: "associate" }
        : {
            action: unitResolution?.resolution === "associate" ? "associate" : "create",
            ...(unitResolution?.resolution === "associate" && unitResolution.existingId
              ? { existing_id: unitResolution.existingId }
              : { fingerprint: row.unit.fingerprint ?? undefined, label: row.unit.label ?? undefined, type: row.unit.type ?? undefined, area_sqm: row.unit.areaSqm ?? undefined }),
          },
      tenant: {
        action: tenantResolution?.resolution === "associate" ? "associate" : "create",
        ...(tenantResolution?.resolution === "associate" && tenantResolution.existingId
          ? { existing_id: tenantResolution.existingId }
          : { fingerprint: row.tenant.fingerprint ?? undefined, full_name: row.tenant.fullName ?? undefined, phone: row.tenant.phone ?? undefined, email: row.tenant.email ?? undefined }),
      },
      lease: {
        start_date: row.lease.startDate ?? "",
        billing_frequency: row.lease.billingFrequency ?? "monthly",
        due_day: row.lease.dueDay ?? undefined,
        base_rent_xaf: row.lease.baseRentXaf ?? 0,
        recurring_charges_xaf: row.lease.recurringChargesXaf,
        security_deposit_xaf: row.lease.securityDepositXaf,
        opening_situation: { kind: row.lease.openingSituation.kind, amount_xaf: row.lease.openingSituation.amountXaf },
        deposit_situation: { status: row.lease.depositSituation.status, paid_amount_xaf: row.lease.depositSituation.paidAmountXaf },
      },
    };
    return payload;
  });
}
