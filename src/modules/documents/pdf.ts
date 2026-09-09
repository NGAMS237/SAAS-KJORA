import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { FinancialDocumentRecord, FinancialDocumentType } from "@/modules/documents/model";

const INK = rgb(19 / 255, 37 / 255, 58 / 255);
const GOLD = rgb(200 / 255, 137 / 255, 47 / 255);
const MUTED = rgb(83 / 255, 99 / 255, 112 / 255);
const RED = rgb(164 / 255, 66 / 255, 66 / 255);
const PAGE = { width: 595.28, height: 841.89, margin: 48 };

function text(value: unknown) {
  return String(value ?? "—")
    .replace(/[\u00A0\u202F]/g, " ")
    .replaceAll("œ", "oe").replaceAll("Œ", "OE")
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\u0009\u000A\u000D\u0020-\u007E\u00A0-\u00FF]/g, "?");
}

export function formatPdfMoney(value: unknown, currency = "XAF") {
  const amount = Number(value ?? 0);
  const formatted = Number.isFinite(amount) ? amount.toLocaleString("fr-FR") : "0";
  return `${formatted.replace(/[\u00A0\u202F]/g, " ")} ${currency}`;
}

const money = formatPdfMoney;

export function dueNoticePresentation(snapshot: Record<string, unknown>, language: "fr" | "en") {
  const remaining = Number(snapshot.remaining_xaf ?? 0);
  const coveredUntil = remaining === 0 && typeof snapshot.last_covered_period_end === "string"
    ? snapshot.last_covered_period_end : null;
  return {
    remaining,
    covered: remaining === 0,
    headline: remaining === 0
      ? (language === "fr" ? "Échéance couverte" : "Due covered")
      : (language === "fr" ? "Solde à payer" : "Balance due"),
    message: remaining === 0
      ? (language === "fr" ? "Cette échéance est entièrement couverte par les crédits et paiements affectés." : "This due is fully covered by allocated credits and payments.")
      : (language === "fr" ? "Montant restant à régler pour cette échéance." : "Amount remaining for this due."),
    coveredUntil,
  };
}

function date(value: unknown, language: "fr" | "en") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return "—";
  return new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-GB", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function labels(type: FinancialDocumentType, language: "fr" | "en") {
  const copy = {
    due_notice: ["Avis d'échéance", "Due notice"],
    payment_receipt: ["Reçu de paiement", "Payment receipt"],
    rent_receipt: ["Quittance de loyer", "Rent receipt"],
    account_statement: ["État de compte", "Account statement"],
  } satisfies Record<FinancialDocumentType, [string, string]>;
  return copy[type][language === "fr" ? 0 : 1];
}

function wrap(content: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text(content).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
    else { if (line) lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function drawHeader(page: PDFPage, bold: PDFFont, regular: PDFFont, document: FinancialDocumentRecord) {
  const snapshot = document.snapshot;
  page.drawRectangle({ x: 0, y: PAGE.height - 128, width: PAGE.width, height: 128, color: INK });
  page.drawRectangle({ x: PAGE.margin, y: PAGE.height - 42, width: 52, height: 4, color: GOLD });
  page.drawText("KJORA", { x: PAGE.margin, y: PAGE.height - 70, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText(text(snapshot.organization_name), { x: PAGE.margin, y: PAGE.height - 92, size: 9, font: regular, color: rgb(.85, .89, .92) });
  const title = labels(document.type, document.language);
  const titleWidth = bold.widthOfTextAtSize(title, 21);
  page.drawText(title, { x: PAGE.width - PAGE.margin - titleWidth, y: PAGE.height - 69, size: 21, font: bold, color: rgb(1, 1, 1) });
  const refWidth = regular.widthOfTextAtSize(document.reference, 9);
  page.drawText(document.reference, { x: PAGE.width - PAGE.margin - refWidth, y: PAGE.height - 92, size: 9, font: regular, color: rgb(.85, .89, .92) });
  if (document.status === "invalidated") {
    page.drawRectangle({ x: PAGE.margin, y: PAGE.height - 154, width: PAGE.width - PAGE.margin * 2, height: 22, color: RED });
    page.drawText(document.language === "fr" ? "DOCUMENT INVALIDÉ - ORIGINAL CONSERVÉ" : "INVALIDATED DOCUMENT - ORIGINAL RETAINED", {
      x: PAGE.margin + 10, y: PAGE.height - 148, size: 9, font: bold, color: rgb(1, 1, 1),
    });
  }
}

function row(page: PDFPage, regular: PDFFont, bold: PDFFont, y: number, label: string, value: string) {
  page.drawText(text(label), { x: PAGE.margin, y, size: 9, font: regular, color: MUTED });
  const safeValue = text(value);
  const width = bold.widthOfTextAtSize(safeValue, 10);
  page.drawText(safeValue, { x: Math.max(PAGE.margin + 170, PAGE.width - PAGE.margin - width), y, size: 10, font: bold, color: INK });
  page.drawLine({ start: { x: PAGE.margin, y: y - 7 }, end: { x: PAGE.width - PAGE.margin, y: y - 7 }, thickness: .5, color: rgb(.84, .87, .89) });
}

function drawFooter(page: PDFPage, regular: PDFFont, document: FinancialDocumentRecord) {
  const copy = document.language === "fr"
    ? `Généré par KJORA le ${date(document.issuedOn, "fr")} · Document ${document.templateVersion}`
    : `Generated by KJORA on ${date(document.issuedOn, "en")} · Document ${document.templateVersion}`;
  page.drawLine({ start: { x: PAGE.margin, y: 45 }, end: { x: PAGE.width - PAGE.margin, y: 45 }, thickness: .75, color: GOLD });
  page.drawText(text(copy), { x: PAGE.margin, y: 29, size: 7.5, font: regular, color: MUTED });
}

function drawStandardBody(page: PDFPage, regular: PDFFont, bold: PDFFont, document: FinancialDocumentRecord) {
  const s = document.snapshot;
  const fr = document.language === "fr";
  let y = document.status === "invalidated" ? 654 : 680;
  page.drawText(text(s.tenant_name), { x: PAGE.margin, y, size: 18, font: bold, color: INK });
  y -= 22;
  page.drawText(`${text(s.property_name)} · ${text(s.unit_label)} · ${text(s.property_locality)}`, { x: PAGE.margin, y, size: 9.5, font: regular, color: MUTED });
  y -= 42;

  if (document.type === "due_notice") {
    const presentation = dueNoticePresentation(s, document.language);
    const currency = typeof s.currency === "string" ? s.currency : "XAF";
    page.drawRectangle({ x: PAGE.margin, y: y - 54, width: PAGE.width - PAGE.margin * 2, height: 72, color: rgb(.95, .92, .84) });
    page.drawText(text(presentation.headline), { x: PAGE.margin + 16, y: y - 2, size: 9, font: bold, color: MUTED });
    page.drawText(presentation.covered ? text(presentation.message) : money(presentation.remaining, currency), { x: PAGE.margin + 16, y: y - 30, size: presentation.covered ? 10 : 22, font: bold, color: INK });
    y -= 92;
  }

  if (document.type === "payment_receipt") {
    row(page, regular, bold, y, fr ? "Référence du paiement" : "Payment reference", text(s.payment_reference)); y -= 34;
    row(page, regular, bold, y, fr ? "Date de réception" : "Receipt date", date(s.payment_date, document.language)); y -= 34;
    row(page, regular, bold, y, fr ? "Date d’enregistrement" : "Recorded on", date(s.recorded_at, document.language)); y -= 34;
    row(page, regular, bold, y, fr ? "Moyen de paiement" : "Payment method", text(s.method)); y -= 34;
    if (s.external_reference) { row(page, regular, bold, y, fr ? "Référence externe" : "External reference", text(s.external_reference)); y -= 34; }
    row(page, regular, bold, y, fr ? "Montant reçu" : "Amount received", money(s.amount_xaf)); y -= 34;
    if (Number(s.linked_due_total_xaf ?? 0) > 0) {
      row(page, regular, bold, y, fr ? "Total des échéances concernées" : "Linked dues total", money(s.linked_due_total_xaf)); y -= 34;
      row(page, regular, bold, y, fr ? "Crédit appliqué (distinct du paiement)" : "Credit applied (separate from payment)", money(s.credit_applied_xaf)); y -= 34;
      row(page, regular, bold, y, fr ? "Paiements reçus affectés" : "Received Payments allocated", money(s.allocated_xaf)); y -= 34;
      row(page, regular, bold, y, fr ? "Reste dû sur ces échéances" : "Remaining on these dues", money(s.linked_due_remaining_xaf)); y -= 34;
    } else {
      row(page, regular, bold, y, fr ? "Montant alloué" : "Allocated amount", money(s.allocated_xaf)); y -= 34;
    }
    if (Number(s.credit_created_xaf ?? 0) > 0) {
      row(page, regular, bold, y, fr ? "Crédit créé par ce paiement" : "Credit created by this payment", money(s.credit_created_xaf));
    }
    if (Number(s.linked_due_total_xaf ?? 0) === 0) {
      y -= 34;
      const balance = Number(s.balance_after_xaf ?? 0);
      row(page, regular, bold, y,
        balance > 0 ? (fr ? "Crédit disponible après paiement" : "Available credit after payment")
          : balance < 0 ? (fr ? "Solde dû après paiement" : "Balance due after payment")
            : (fr ? "Situation après paiement" : "Position after payment"),
        balance === 0 ? (fr ? "À jour · 0 XAF" : "Up to date · 0 XAF") : money(Math.abs(balance)));
    }
  } else {
    row(page, regular, bold, y, fr ? "Période" : "Period", `${date(s.period_start, document.language)} - ${date(s.period_end, document.language)}`); y -= 34;
    row(page, regular, bold, y, fr ? "Date limite" : "Due date", date(s.due_date, document.language)); y -= 34;
    const currency = typeof s.currency === "string" ? s.currency : "XAF";
    row(page, regular, bold, y, fr ? "Loyer" : "Rent", money(s.rent_xaf, currency)); y -= 34;
    row(page, regular, bold, y, fr ? "Charges" : "Charges", money(s.recurring_charges_xaf, currency)); y -= 34;
    if (Number(s.deposit_xaf ?? 0) > 0) { row(page, regular, bold, y, fr ? "Dépôt" : "Deposit", money(s.deposit_xaf, currency)); y -= 34; }
    if (document.type === "due_notice") {
      row(page, regular, bold, y, fr ? "Total de l’échéance" : "Due total", money(s.expected_xaf, currency)); y -= 34;
      row(page, regular, bold, y, fr ? "Crédit appliqué" : "Credit applied", money(s.credit_applied_xaf, currency)); y -= 34;
      row(page, regular, bold, y, fr ? "Paiements affectés" : "Payments allocated", money(s.payment_allocated_xaf, currency)); y -= 34;
      row(page, regular, bold, y, fr ? "Reste dû" : "Remaining", money(s.remaining_xaf, currency));
    } else {
      row(page, regular, bold, y, fr ? "Montant acquitté" : "Settled amount", money(s.expected_xaf, currency));
    }
    if (document.type === "due_notice" && dueNoticePresentation(s, document.language).coveredUntil) {
      y -= 34;
      row(page, regular, bold, y, fr ? "Dernière période prépayée" : "Last prepaid period", date(s.last_covered_period_end, document.language));
    }
  }

  const note = document.type === "rent_receipt"
    ? (fr ? "Cette quittance atteste uniquement du règlement de la période indiquée. Elle est distincte du reçu de paiement." : "This rent receipt certifies settlement of the stated period only. It is distinct from the payment receipt.")
    : document.type === "due_notice"
      ? (fr ? "Cet avis expose une échéance attendue. Il ne constitue ni un paiement, ni un reçu, ni une quittance." : "This notice states an expected due. It is not a payment, payment receipt, or rent receipt.")
      : (fr ? "Ce reçu atteste un encaissement réel enregistré. Il ne vaut quittance que pour les périodes intégralement soldées." : "This receipt confirms a recorded real payment. It is not a rent receipt except for fully settled periods.");
  y -= 62;
  for (const line of wrap(note, regular, 9, PAGE.width - PAGE.margin * 2)) {
    page.drawText(line, { x: PAGE.margin, y, size: 9, font: regular, color: MUTED }); y -= 13;
  }
}

function drawStatement(pdf: PDFDocument, regular: PDFFont, bold: PDFFont, document: FinancialDocumentRecord) {
  const entries = Array.isArray(document.snapshot.entries) ? document.snapshot.entries as Record<string, unknown>[] : [];
  let page = pdf.addPage([PAGE.width, PAGE.height]);
  drawHeader(page, bold, regular, document);
  let y = document.status === "invalidated" ? 650 : 678;
  page.drawText(text(document.snapshot.tenant_name), { x: PAGE.margin, y, size: 17, font: bold, color: INK }); y -= 20;
  page.drawText(`${date(document.snapshot.period_from, document.language)} - ${date(document.snapshot.period_to, document.language)}`, { x: PAGE.margin, y, size: 9, font: regular, color: MUTED }); y -= 34;

  const headings = document.language === "fr" ? ["Date", "Opération", "Débit", "Crédit", "Solde"] : ["Date", "Operation", "Debit", "Credit", "Balance"];
  const drawTableHead = () => {
    page.drawRectangle({ x: PAGE.margin, y: y - 4, width: PAGE.width - PAGE.margin * 2, height: 22, color: INK });
    [PAGE.margin + 6, PAGE.margin + 76, PAGE.margin + 260, PAGE.margin + 330, PAGE.margin + 402].forEach((x, index) => page.drawText(headings[index], { x, y: y + 3, size: 7.5, font: bold, color: rgb(1, 1, 1) }));
    y -= 22;
  };
  drawTableHead();
  for (const entry of entries) {
    if (y < 76) { drawFooter(page, regular, document); page = pdf.addPage([PAGE.width, PAGE.height]); drawHeader(page, bold, regular, document); y = 674; drawTableHead(); }
    const values = [
      typeof entry.date === "string" ? entry.date.slice(0, 10) : "—",
      `${text(entry.type)} · ${text(entry.reference)}`,
      Number(entry.debit_xaf) ? money(entry.debit_xaf) : "—",
      Number(entry.credit_xaf) ? money(entry.credit_xaf) : "—",
      money(entry.balance_xaf),
    ];
    const xs = [PAGE.margin + 6, PAGE.margin + 76, PAGE.margin + 260, PAGE.margin + 330, PAGE.margin + 402];
    values.forEach((value, index) => page.drawText(text(value).slice(0, index === 1 ? 34 : 18), { x: xs[index], y, size: 7.2, font: index >= 2 ? bold : regular, color: INK }));
    page.drawLine({ start: { x: PAGE.margin, y: y - 6 }, end: { x: PAGE.width - PAGE.margin, y: y - 6 }, thickness: .35, color: rgb(.86, .88, .9) });
    y -= 22;
  }
  y -= 18;
  row(page, regular, bold, y, document.language === "fr" ? "Solde de clôture" : "Closing balance", money(document.snapshot.closing_balance_xaf));
  drawFooter(page, regular, document);
}

export async function generateFinancialDocumentPdf(document: FinancialDocumentRecord) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${labels(document.type, document.language)} · ${document.reference}`);
  pdf.setAuthor("KJORA");
  pdf.setCreator(`KJORA ${document.templateVersion}`);
  pdf.setCreationDate(new Date(`${document.issuedOn}T12:00:00Z`));
  pdf.setModificationDate(new Date(`${document.issuedOn}T12:00:00Z`));
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  if (document.type === "account_statement") drawStatement(pdf, regular, bold, document);
  else {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    drawHeader(page, bold, regular, document);
    drawStandardBody(page, regular, bold, document);
    drawFooter(page, regular, document);
  }
  return pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 });
}
