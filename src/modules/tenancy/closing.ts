// Synthèse de fin de bail (« solde de tout compte ») calculée uniquement à partir
// des montants déjà projetés par le serveur pour chaque échéance. Aucun montant
// n'est inventé : on additionne ce qui reste dû, ce qui a été versé sur le dépôt
// et le crédit disponible.

type ClosingDue = {
  kind: string;
  status: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  remainingXaf: number;
  depositXaf: number;
  paymentAllocatedXaf: number;
};

export type LeaseClosingSummary = {
  rentRemainingXaf: number;
  depositHeldXaf: number;
  depositRemainingXaf: number;
  creditXaf: number;
  openPeriods: Array<{ periodStart: string; periodEnd: string; remainingXaf: number }>;
  netXaf: number; // > 0 : le locataire doit encore ; < 0 : à rembourser au locataire
};

export function leaseClosingSummary(dues: readonly ClosingDue[], availableCreditXaf: number): LeaseClosingSummary {
  let rentRemainingXaf = 0;
  let depositHeldXaf = 0;
  let depositRemainingXaf = 0;
  const openPeriods: LeaseClosingSummary["openPeriods"] = [];
  for (const due of dues) {
    if (due.status === "cancelled" || due.kind === "adjustment") continue;
    if (due.kind === "deposit") {
      depositHeldXaf += due.paymentAllocatedXaf;
      depositRemainingXaf += due.remainingXaf;
      continue;
    }
    if (due.remainingXaf > 0) {
      rentRemainingXaf += due.remainingXaf;
      openPeriods.push({ periodStart: due.periodStart, periodEnd: due.periodEnd, remainingXaf: due.remainingXaf });
    }
  }
  const creditXaf = Math.max(0, availableCreditXaf);
  return {
    rentRemainingXaf,
    depositHeldXaf,
    depositRemainingXaf,
    creditXaf,
    openPeriods,
    netXaf: rentRemainingXaf - creditXaf - depositHeldXaf,
  };
}
