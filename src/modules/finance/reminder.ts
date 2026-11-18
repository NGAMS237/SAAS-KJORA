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
  withNotice?: boolean;     // true quand l'avis d'échéance PDF est joint au message
};

// Textes de relance WhatsApp (propres à la relance : les modèles généraux de la bibliothèque ne changent pas).
const REMINDER_BODIES: Record<ReminderTemplateKey, string> = {
  retard: "Bonjour {prenom}, j’espère que vous allez bien. Je me permets de vous relancer au sujet du loyer de {mois} pour {logement} : il reste {du} à régler.{avis} Merci de régulariser dès que possible. Si vous rencontrez une difficulté, n’hésitez pas à m’en parler, nous trouverons une solution ensemble. {signature}",
  rappel_avant: "Bonjour {prenom}, j’espère que vous allez bien. Petit rappel amical : le loyer de {mois} pour {logement}, soit {total}, est à régler le {jour} de ce mois.{avis} Merci d’avance ! {signature}",
};

const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export function reminderMonthLabel(dueDate: string): string {
  const month = Number(dueDate.slice(5, 7));
  return MONTHS_FR[month - 1] ? `${MONTHS_FR[month - 1]} ${dueDate.slice(0, 4)}` : "ce mois";
}

export function reminderGreetingName(tenantName: string, civility: "M." | "Mme" | null): string {
  return civility ? `${civility} ${tenantName.trim()}`.trim() : firstName(tenantName);
}

export function defaultReminderTemplate(status: string): ReminderTemplateKey {
  return status === "overdue" || status === "partially_paid" ? "retard" : "rappel_avant";
}

export function buildReminder(input: ReminderInput): { subject: string; body: string; amountXaf: number } {
  const template = templateByKey(input.templateKey);
  const amountXaf = Math.max(input.totalDueXaf, input.rowRemainingXaf);
  const avis = input.withNotice ? " Vous trouverez ci-joint l’avis d’échéance correspondant." : "";
  const body = renderTemplate(REMINDER_BODIES[input.templateKey].replace("{avis}", avis), {
    mois: reminderMonthLabel(input.dueDate),
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
