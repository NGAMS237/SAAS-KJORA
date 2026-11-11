// Message de relance affiché dans le tiroir « Relancer » — logique PURE (testée).
// Le montant cité est le TOTAL réellement dû par le locataire (toutes échéances échues), pas
// seulement le reste de la ligne cliquée ; la civilité (M. / Mme) précède le nom quand elle est connue.
import { firstName, formatXaf, renderTemplate, templateByKey } from "../communications/message-templates.ts";

export type ReminderTemplateKey = "retard" | "rappel_avant";

export type ReminderInput = {
  templateKey: ReminderTemplateKey;
  tenantName: string;
  civility: "M." | "Mme" | null;
  unitLabel: string;
  totalDueXaf: number;      // total dû par le locataire (même chiffre que « Doit X » / Solde)
  rowRemainingXaf: number;  // reste de l'échéance cliquée
  rowTotalXaf: number;      // montant de l'échéance cliquée (loyer + charges)
  dueDate: string;          // YYYY-MM-DD
};

export function reminderGreetingName(tenantName: string, civility: "M." | "Mme" | null): string {
  return civility ? `${civility} ${tenantName.trim()}`.trim() : firstName(tenantName);
}

export function defaultReminderTemplate(status: string): ReminderTemplateKey {
  return status === "overdue" || status === "partially_paid" ? "retard" : "rappel_avant";
}

export function buildReminder(input: ReminderInput): { subject: string; body: string; amountXaf: number } {
  const template = templateByKey(input.templateKey);
  const amountXaf = Math.max(input.totalDueXaf, input.rowRemainingXaf);
  const body = renderTemplate(template.body, {
    prenom: reminderGreetingName(input.tenantName, input.civility),
    nom: input.tenantName,
    logement: input.unitLabel,
    du: formatXaf(amountXaf),
    total: formatXaf(input.rowTotalXaf),
    jour: String(Number(input.dueDate.slice(8, 10))),
    signature: "Cordialement.",
  });
  return { subject: template.subject, body, amountXaf };
}

// Adresse de la page de paiement chargée dans le tiroir (montant proposé, modifiable dans le formulaire).
export function paymentDrawerHref(leaseId: string, amountXaf: number): string {
  return `/app/paiements/nouveau?lease=${encodeURIComponent(leaseId)}&amount=${Math.max(0, Math.round(amountXaf))}`;
}

// Pour un paiement enregistré, l'application navigue vers /app/paiements/<uuid> : c'est le signal « terminé ».
export function isPaymentRecordedPath(pathname: string): boolean {
  return /^\/app\/paiements\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(pathname);
}
