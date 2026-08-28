import type { FinancialDocumentRecord } from "@/modules/documents/model";

export type FinancialEmail = { subject: string; html: string; text: string };

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function amount(value: unknown, language: "fr" | "en") {
  const parsed = Number(value ?? 0);
  return `${Number.isFinite(parsed) ? parsed.toLocaleString(language === "fr" ? "fr-FR" : "en-GB") : "0"} XAF`;
}

function date(value: unknown, language: "fr" | "en") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return "—";
  return new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-GB", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function detailRows(document: FinancialDocumentRecord) {
  const fr = document.language === "fr";
  const snapshot = document.snapshot;
  const rows: Array<[string, string]> = [
    [fr ? "Bien / unité" : "Property / unit", `${String(snapshot.property_name ?? "—")} · ${String(snapshot.unit_label ?? "—")}`],
  ];
  if (document.type === "payment_receipt") {
    rows.push(
      [fr ? "Référence Payment" : "Payment reference", String(snapshot.payment_reference ?? "—")],
      [fr ? "Montant reçu" : "Amount received", amount(snapshot.amount_xaf, document.language)],
      [fr ? "Date de réception" : "Receipt date", date(snapshot.payment_date, document.language)],
      [fr ? "Date d’enregistrement" : "Recorded on", date(snapshot.recorded_at, document.language)],
      [fr ? "Moyen" : "Method", String(snapshot.method ?? "—")],
      [fr ? "Montant alloué" : "Allocated amount", amount(snapshot.allocated_xaf, document.language)],
      [fr ? "Crédit créé" : "Credit created", amount(snapshot.credit_created_xaf, document.language)],
    );
    if (Number(snapshot.rent_allocated_xaf ?? 0) > 0) rows.push([fr ? "Dont loyer" : "Rent allocation", amount(snapshot.rent_allocated_xaf, document.language)]);
    if (Number(snapshot.recurring_charges_allocated_xaf ?? 0) > 0) rows.push([fr ? "Dont charges" : "Charges allocation", amount(snapshot.recurring_charges_allocated_xaf, document.language)]);
    if (Number(snapshot.deposit_allocated_xaf ?? 0) > 0) rows.push([fr ? "Dont dépôt de garantie" : "Security deposit allocation", amount(snapshot.deposit_allocated_xaf, document.language)]);
    if (snapshot.external_reference) rows.push([fr ? "Référence externe" : "External reference", String(snapshot.external_reference)]);
    const balance = Number(snapshot.balance_after_xaf ?? 0);
    rows.push([
      balance > 0 ? (fr ? "Crédit disponible après paiement" : "Available credit after payment")
        : balance < 0 ? (fr ? "Solde dû après paiement" : "Balance due after payment")
          : (fr ? "Situation après paiement" : "Position after payment"),
      balance === 0 ? (fr ? "À jour · 0 XAF" : "Up to date · 0 XAF") : amount(Math.abs(balance), document.language),
    ]);
  } else if (document.type === "account_statement") {
    rows.push(
      [fr ? "Période" : "Period", `${date(snapshot.period_from, document.language)} – ${date(snapshot.period_to, document.language)}`],
      [fr ? "Solde de clôture" : "Closing balance", amount(snapshot.closing_balance_xaf, document.language)],
    );
  } else {
    rows.push(
      [fr ? "Période" : "Period", `${date(snapshot.period_start, document.language)} – ${date(snapshot.period_end, document.language)}`],
      [fr ? "Date limite" : "Due date", date(snapshot.due_date, document.language)],
      [fr ? "Montant locatif" : "Rental amount", amount(snapshot.expected_xaf, document.language)],
    );
    if (document.type === "due_notice") {
      rows.push([fr ? "Reste attendu" : "Expected remainder", amount(snapshot.remaining_xaf, document.language)]);
      if (Number(snapshot.credit_applied_xaf ?? 0) > 0) {
        rows.push([fr ? "Crédit affecté" : "Credit applied", amount(snapshot.credit_applied_xaf, document.language)]);
      }
    }
  }
  return rows;
}

export function financialDocumentEmail(document: FinancialDocumentRecord): FinancialEmail {
  const fr = document.language === "fr";
  const tenant = String(document.snapshot.tenant_name ?? "");
  const organization = String(document.snapshot.organization_name ?? "KJORA");
  const period = date(document.snapshot.period_start, document.language);
  const titles = {
    due_notice: fr ? `Votre échéance du ${date(document.snapshot.due_date, "fr")} — KJORA` : `Your due on ${date(document.snapshot.due_date, "en")} — KJORA`,
    payment_receipt: fr ? `Paiement reçu — ${amount(document.snapshot.amount_xaf, "fr")}` : `Payment received — ${amount(document.snapshot.amount_xaf, "en")}`,
    rent_receipt: fr ? `Quittance — ${period}` : `Rent receipt — ${period}`,
    account_statement: fr ? "Votre état de compte" : "Your account statement",
  };
  const title = titles[document.type];
  const introduction = fr
    ? `Bonjour ${tenant}, votre document KJORA est joint à cet email.`
    : `Hello ${tenant}, your KJORA document is attached to this email.`;
  const caution = document.type === "due_notice"
    ? (fr ? "Cet avis n’est ni un paiement, ni un reçu, ni une quittance." : "This notice is not a payment, payment receipt, or rent receipt.")
    : document.type === "payment_receipt"
      ? (fr ? "Ce reçu confirme un encaissement réel ; il ne vaut quittance que pour une période intégralement soldée." : "This receipt confirms a real payment; it is a rent receipt only for a fully settled period.")
      : "";
  const rows = detailRows(document);
  const text = `${title}\n\n${introduction}\n${document.reference}\n\n${rows.map(([label, value]) => `${label} : ${value}`).join("\n")}\n\n${caution}\n\n${organization}`.trim();
  const table = rows.map(([label, value]) => `<tr><td style="padding:9px 0;color:#536370;border-bottom:1px solid #e2e7ea">${escapeHtml(label)}</td><td align="right" style="padding:9px 0;font-weight:700;border-bottom:1px solid #e2e7ea">${escapeHtml(value)}</td></tr>`).join("");
  return {
    subject: title,
    text,
    html: `<!doctype html><html><body style="margin:0;background:#edf1f3;font-family:Arial,sans-serif;color:#14212d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fffdf8;border-radius:24px;overflow:hidden"><tr><td style="background:#13253a;color:white;padding:26px 30px"><div style="width:52px;border-top:4px solid #c8892f;margin-bottom:16px"></div><strong style="font-size:22px">${escapeHtml(organization)}</strong></td></tr><tr><td style="padding:30px"><p style="color:#c8892f;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(document.reference)}</p><h1 style="font-size:27px;margin:8px 0 18px">${escapeHtml(title)}</h1><p style="line-height:1.6">${escapeHtml(introduction)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0">${table}</table>${caution ? `<p style="background:#f4e8d2;border-radius:14px;padding:14px;line-height:1.5">${escapeHtml(caution)}</p>` : ""}<p style="color:#536370;font-size:13px;margin-top:28px">${fr ? "Le PDF joint constitue la version privée et traçable du document." : "The attached PDF is the private, traceable version of the document."}</p><p style="font-weight:700;margin-top:20px">${escapeHtml(organization)}</p></td></tr></table></td></tr></table></body></html>`,
  };
}

export function controlledDeliveryError(value: unknown) {
  const message = value instanceof Error ? value.message : String(value ?? "delivery_failed");
  return message.replace(/[\r\n\t]+/g, " ").replace(/(?:Bearer|token|key|secret)\s+[^ ]+/gi, "[redacted]").slice(0, 500);
}
