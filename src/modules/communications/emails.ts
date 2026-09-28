// =============================================================================
// KJORA — Gabarits de courriels transactionnels (NOTIFICATIONS-COMMUNICATIONS-E2E-01)
// =============================================================================
// Module PUR. Deux domaines STRICTEMENT séparés :
//   • loyers : réutilise financialDocumentEmail (avis, reçu, quittance) ;
//     ajoute seulement la variante « rappel de retard » et la « copie
//     propriétaire » ;
//   • SaaS : facture émise, rappel avant échéance, retard, reçu — adressés au
//     propriétaire de l'Organization, jamais à un locataire.
// Transactionnel uniquement : aucun contenu promotionnel, aucun lien de
// désinscription marketing, aucune donnée de consentement lue.
// Pièce jointe PDF plutôt qu'un lien : aucun lien public, permanent ou non,
// vers un document privé n'est jamais placé dans un courriel.
// =============================================================================

import { financialDocumentEmail, type FinancialEmail } from "../documents/email.ts";
import type { FinancialDocumentRecord } from "../documents/model.ts";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function longDate(value: unknown, language: "fr" | "en") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return "—";
  return new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-GB", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function xaf(minor: unknown, language: "fr" | "en") {
  const parsed = Number(minor ?? 0);
  return `${Number.isFinite(parsed) ? parsed.toLocaleString(language === "fr" ? "fr-FR" : "en-GB") : "0"} XAF`;
}

// -----------------------------------------------------------------------------
// Loyers
// -----------------------------------------------------------------------------

export const RENT_TEMPLATE_KEYS = ["due_notice", "payment_receipt", "rent_receipt", "account_statement", "overdue_reminder"] as const;

export function rentDeliveryEmail(
  document: FinancialDocumentRecord,
  options: { templateKey: string; ownerCopy: boolean },
): FinancialEmail {
  const base = financialDocumentEmail(document);
  const fr = document.language === "fr";
  let subject = base.subject;
  let notice = "";
  if (options.templateKey === "overdue_reminder") {
    subject = fr ? `Rappel — ${base.subject}` : `Reminder — ${base.subject}`;
    notice = fr
      ? "Rappel : cette échéance n’est pas encore réglée à ce jour. Si vous avez déjà payé, merci de ne pas tenir compte de ce message."
      : "Reminder: this due is still unpaid today. If you have already paid, please disregard this message.";
  }
  if (options.ownerCopy) {
    subject = fr ? `Copie propriétaire — ${subject}` : `Owner copy — ${subject}`;
    notice = [notice, fr
      ? "Copie du document transmis à votre locataire (réglage « copie propriétaire »)."
      : "Copy of the document sent to your tenant (“owner copy” setting)."].filter(Boolean).join(" ");
  }
  if (!notice) return { ...base, subject };
  const banner = `<p style="background:#f4e8d2;border-radius:14px;padding:14px;margin:0 0 18px;line-height:1.5">${escapeHtml(notice)}</p>`;
  return {
    subject,
    text: `${notice}\n\n${base.text}`,
    html: base.html.replace(/(<td style="padding:30px">)/, `$1${banner}`),
  };
}

// -----------------------------------------------------------------------------
// SaaS (Afrique/XAF)
// -----------------------------------------------------------------------------

export const SAAS_TEMPLATE_KEYS = ["saas_invoice_issued", "saas_invoice_due_soon", "saas_invoice_overdue", "saas_receipt"] as const;
export type SaasTemplateKey = (typeof SAAS_TEMPLATE_KEYS)[number];

export function isSaasTemplateKey(value: unknown): value is SaasTemplateKey {
  return typeof value === "string" && (SAAS_TEMPLATE_KEYS as readonly string[]).includes(value);
}

export type SaasInvoiceForEmail = {
  number: string;
  organizationName: string;
  planLabel: string;
  cycleLabel: string;
  amountMinor: number;
  periodStart: string;
  periodEnd: string;
  dueOn: string | null;
  paidAt: string | null;
};

export function saasBillingEmail(template: SaasTemplateKey, invoice: SaasInvoiceForEmail, language: "fr" | "en"): FinancialEmail {
  const fr = language === "fr";
  const due = longDate(invoice.dueOn ?? invoice.periodEnd, language);
  const amount = xaf(invoice.amountMinor, language);
  const copy: Record<SaasTemplateKey, { subject: string; lead: string }> = {
    saas_invoice_issued: {
      subject: fr ? `Facture d’abonnement KJORA ${invoice.number}` : `KJORA subscription invoice ${invoice.number}`,
      lead: fr ? `Votre facture d’abonnement est disponible. Montant : ${amount}, à régler au plus tard le ${due}.`
        : `Your subscription invoice is available. Amount: ${amount}, due by ${due}.`,
    },
    saas_invoice_due_soon: {
      subject: fr ? `Rappel : facture KJORA ${invoice.number} à régler avant le ${due}` : `Reminder: KJORA invoice ${invoice.number} due by ${due}`,
      lead: fr ? `Votre facture d’abonnement (${amount}) arrive à échéance le ${due}.`
        : `Your subscription invoice (${amount}) is due on ${due}.`,
    },
    saas_invoice_overdue: {
      subject: fr ? `Facture KJORA ${invoice.number} en retard` : `KJORA invoice ${invoice.number} is overdue`,
      lead: fr ? `Votre facture d’abonnement (${amount}) était à régler le ${due}. Merci de la régulariser pour conserver l’accès à votre espace.`
        : `Your subscription invoice (${amount}) was due on ${due}. Please settle it to keep access to your workspace.`,
    },
    saas_receipt: {
      subject: fr ? `Reçu d’abonnement KJORA ${invoice.number}` : `KJORA subscription receipt ${invoice.number}`,
      lead: fr ? `Nous confirmons la réception de votre règlement de ${amount}. Merci.`
        : `We confirm receipt of your payment of ${amount}. Thank you.`,
    },
  };
  const { subject, lead } = copy[template];
  const rows: Array<[string, string]> = [
    [fr ? "Organization" : "Organization", invoice.organizationName || "—"],
    [fr ? "Offre" : "Plan", `${invoice.planLabel} · ${invoice.cycleLabel}`],
    [fr ? "Période" : "Period", `${longDate(invoice.periodStart, language)} – ${longDate(invoice.periodEnd, language)}`],
    [fr ? "Montant" : "Amount", amount],
    template === "saas_receipt"
      ? [fr ? "Réglée le" : "Paid on", longDate(invoice.paidAt, language)]
      : [fr ? "Échéance" : "Due date", due],
  ];
  const footer = fr
    ? "Courriel transactionnel lié à votre abonnement KJORA. Le PDF joint fait foi."
    : "Transactional email about your KJORA subscription. The attached PDF is authoritative.";
  const table = rows.map(([label, value]) => `<tr><td style="padding:9px 0;color:#536370;border-bottom:1px solid #e2e7ea">${escapeHtml(label)}</td><td align="right" style="padding:9px 0;font-weight:700;border-bottom:1px solid #e2e7ea">${escapeHtml(value)}</td></tr>`).join("");
  return {
    subject,
    text: `${subject}\n\n${lead}\n\n${rows.map(([label, value]) => `${label} : ${value}`).join("\n")}\n\n${footer}`,
    html: `<!doctype html><html><body style="margin:0;background:#edf1f3;font-family:Arial,sans-serif;color:#14212d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fffdf8;border-radius:24px;overflow:hidden"><tr><td style="background:#13253a;color:white;padding:26px 30px"><div style="width:52px;border-top:4px solid #c8892f;margin-bottom:16px"></div><strong style="font-size:22px">KJORA</strong></td></tr><tr><td style="padding:30px"><p style="color:#c8892f;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(invoice.number)}</p><h1 style="font-size:24px;margin:8px 0 18px">${escapeHtml(subject)}</h1><p style="line-height:1.6">${escapeHtml(lead)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0">${table}</table><p style="color:#536370;font-size:13px;margin-top:28px">${escapeHtml(footer)}</p></td></tr></table></td></tr></table></body></html>`,
  };
}
