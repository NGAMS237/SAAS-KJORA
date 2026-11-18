// Message WhatsApp d'un reçu de paiement — logique PURE (testée).
// Le texte correspond au reçu PDF : paiement qui solde, paiement partiel (acompte) ou avance (crédit).
import { firstName, formatXaf } from "../communications/message-templates.ts";
import { reminderMonthLabel } from "../finance/reminder.ts";

export type PaymentReceiptKind = "settled" | "partial" | "advance";

/** balanceAfterXaf : solde global après le paiement (positif = crédit, négatif = reste dû). */
export function paymentReceiptKind(balanceAfterXaf: number, creditCreatedXaf: number): PaymentReceiptKind {
  if (balanceAfterXaf < 0) return "partial";
  if (creditCreatedXaf > 0 || balanceAfterXaf > 0) return "advance";
  return "settled";
}

export type PaymentReceiptMessageInput = {
  tenantName: string;
  civility: "M." | "Mme" | null;
  unitLabel: string;
  amountXaf: number;
  paymentDate: string; // YYYY-MM-DD
  methodLabel: string;
  allocations: Array<{ periodStart: string; dueKind: string }>;
  creditCreatedXaf: number;
  balanceAfterXaf: number;
  withPdf: boolean;
  portalUrl?: string | null;
};

const frDate = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;

function coveredLabel(allocations: PaymentReceiptMessageInput["allocations"]): string {
  const labels: string[] = [];
  for (const item of allocations) {
    const label = item.dueKind === "deposit" ? "dépôt de garantie" : `loyer de ${reminderMonthLabel(item.periodStart)}`;
    if (!labels.includes(label)) labels.push(label);
  }
  if (!labels.length) return "";
  return labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
}

export function buildPaymentReceiptMessage(input: PaymentReceiptMessageInput): { kind: PaymentReceiptKind; body: string } {
  const kind = paymentReceiptKind(input.balanceAfterXaf, input.creditCreatedXaf);
  const name = input.civility ? `${input.civility} ${input.tenantName.trim()}` : firstName(input.tenantName);
  const covered = coveredLabel(input.allocations);
  const forWhat = covered ? ` pour le ${covered}` : "";
  const received = `nous avons bien reçu votre ${kind === "partial" ? "paiement partiel (acompte) " : "paiement "}de ${formatXaf(input.amountXaf)} (${input.methodLabel}) le ${frDate(input.paymentDate)}${forWhat} de ${input.unitLabel}.`;
  let situation: string;
  if (kind === "settled") situation = "Votre compte est à jour, merci beaucoup !";
  else if (kind === "partial") situation = `Il reste ${formatXaf(Math.abs(input.balanceAfterXaf))} à régler. Merci de régulariser dès que possible ; si vous avez une difficulté, parlons-en, nous trouverons une solution.`;
  else situation = `Ce paiement dépasse ce qui était dû : ${formatXaf(Math.max(input.creditCreatedXaf, input.balanceAfterXaf))} sont enregistrés en avance et seront déduits de vos prochains loyers. Merci !`;
  const receipt = input.withPdf
    ? "Vous trouverez ci-joint votre reçu de paiement."
    : "Votre reçu de paiement est disponible.";
  const link = input.portalUrl && /^https?:\/\//.test(input.portalUrl) ? ` Vous pouvez aussi le consulter ici : ${input.portalUrl}` : "";
  return { kind, body: `Bonjour ${name}, ${received} ${situation} ${receipt}${link} Cordialement.` };
}
