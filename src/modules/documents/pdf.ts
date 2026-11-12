import { degrees, PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
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

export type DocumentBranding = {
  displayName: string | null; representative: string | null; phone: string | null; email: string | null;
  address: string | null; paymentInstructions: string | null; noticeFooter: string | null; receiptFooter: string | null;
  logoDataUrl: string | null; signatureDataUrl: string | null;
  // Fiche bailleur unique : civilité et cachet (généré, image importée ou aucun) et où l'apposer.
  civility?: "M." | "Mme" | null; stampMode?: StampMode; stampDataUrl?: string | null;
  stampOnContracts?: boolean; stampOnReceipts?: boolean; stampOnNotices?: boolean;
};

export type StampMode = "generated" | "image" | "none";

// Contexte de rendu : informations du bailleur, civilité du locataire et arriéré à la date d'édition.
// Tout est facultatif : sans contexte, le document reste complet (nom de l'Organization du snapshot).
export type DocumentRenderContext = {
  branding?: DocumentBranding | null;
  tenantCivility?: "M." | "Mme" | null;
  arrearsXaf?: number;
};

type EmbeddedImage = Awaited<ReturnType<PDFDocument["embedPng"]>>;
type Images = { logo: EmbeddedImage | null; signature: EmbeddedImage | null; stamp?: EmbeddedImage | null };

const MONTHS_FR = ["JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN", "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE"];
const MONTHS_EN = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const METHOD_LABELS: Record<string, [string, string]> = {
  cash: ["Espèces", "Cash"], mtn_momo: ["MTN Mobile Money", "MTN Mobile Money"], orange_money: ["Orange Money", "Orange Money"],
  bank_transfer: ["Virement bancaire", "Bank transfer"], other: ["Autre moyen", "Other method"],
};
const LINE = rgb(.86, .88, .9);
const SOFT = rgb(.97, .96, .93);
const GREEN = rgb(.2, .45, .34);

export function documentMonthLabel(periodStart: unknown, language: "fr" | "en") {
  if (typeof periodStart !== "string" || !/^\d{4}-\d{2}/.test(periodStart)) return "";
  const month = Number(periodStart.slice(5, 7)) - 1;
  return `${(language === "fr" ? MONTHS_FR : MONTHS_EN)[month] ?? ""} ${periodStart.slice(0, 4)}`.trim();
}

export function paymentMethodLabel(method: unknown, language: "fr" | "en") {
  const entry = typeof method === "string" ? METHOD_LABELS[method] : undefined;
  return entry ? entry[language === "fr" ? 0 : 1] : text(method);
}

function shortDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return "—";
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

function rightText(page: PDFPage, value: string, x: number, y: number, size: number, font: PDFFont, color = INK) {
  const safe = text(value);
  page.drawText(safe, { x: x - font.widthOfTextAtSize(safe, size), y, size, font, color });
}

function centerText(page: PDFPage, value: string, y: number, size: number, font: PDFFont, color = INK) {
  const safe = text(value);
  page.drawText(safe, { x: (PAGE.width - font.widthOfTextAtSize(safe, size)) / 2, y, size, font, color });
}

export async function embedImage(pdf: PDFDocument, dataUrl: string | null | undefined) {
  if (!dataUrl) return null;
  const match = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  try {
    const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
    return match[1] === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch { return null; }
}

function landlordName(document: FinancialDocumentRecord, context: DocumentRenderContext) {
  return text(context.branding?.displayName || document.snapshot.organization_name);
}

function tenantDisplayName(document: FinancialDocumentRecord, context: DocumentRenderContext) {
  const name = text(document.snapshot.tenant_name);
  return context.tenantCivility ? `${context.tenantCivility} ${name}` : name;
}

function drawHeader(page: PDFPage, bold: PDFFont, regular: PDFFont, document: FinancialDocumentRecord, context: DocumentRenderContext = {}, images: Images = { logo: null, signature: null, stamp: null }) {
  const s = document.snapshot;
  const fr = document.language === "fr";
  const top = PAGE.height - PAGE.margin;
  // Logo du bailleur (ou son nom en toutes lettres).
  if (images.logo) {
    const scale = Math.min(150 / images.logo.width, 70 / images.logo.height, 1);
    page.drawImage(images.logo, { x: PAGE.margin, y: top - images.logo.height * scale, width: images.logo.width * scale, height: images.logo.height * scale });
  } else {
    page.drawRectangle({ x: PAGE.margin, y: top - 52, width: 4, height: 52, color: GOLD });
    const lines = wrap(landlordName(document, context).toUpperCase(), bold, 15, 220).slice(0, 2);
    lines.forEach((line, index) => page.drawText(line, { x: PAGE.margin + 14, y: top - 20 - index * 18, size: 15, font: bold, color: INK }));
  }
  // Références à droite.
  const right = PAGE.width - PAGE.margin;
  let y = top - 10;
  const meta: [string, string][] = [[fr ? "Date" : "Date", shortDate(document.issuedOn)]];
  if (s.period_start) meta.push([fr ? "Période" : "Period", `${shortDate(s.period_start)} - ${shortDate(s.period_end)}`]);
  if (document.type === "due_notice" && s.due_date) meta.push([fr ? "À payer le" : "Due on", shortDate(s.due_date)]);
  if (document.type === "payment_receipt" && s.payment_date) meta.push([fr ? "Reçu le" : "Received on", shortDate(s.payment_date)]);
  for (const [label, value] of meta) {
    const valueWidth = bold.widthOfTextAtSize(text(value), 9.5);
    rightText(page, value, right, y, 9.5, bold);
    rightText(page, `${label}  `, right - valueWidth, y, 9.5, regular, MUTED);
    y -= 15;
  }
  const ref = `N° ${document.reference}`;
  const refWidth = bold.widthOfTextAtSize(text(ref), 8.5) + 14;
  page.drawRectangle({ x: right - refWidth, y: y - 6, width: refWidth, height: 18, color: SOFT });
  rightText(page, ref, right - 7, y, 8.5, bold);

  // Bloc DE / À.
  const blockTop = top - 108;
  const b = context.branding;
  page.drawText("DE", { x: PAGE.margin, y: blockTop, size: 7.5, font: bold, color: GOLD });
  page.drawText(fr ? "À" : "TO", { x: PAGE.width / 2 + 10, y: blockTop, size: 7.5, font: bold, color: GOLD });
  const from = [landlordName(document, context).toUpperCase(), b?.representative, b?.address, b?.phone ? `${fr ? "Tél." : "Tel."} ${b.phone}` : null, b?.email]
    .filter((line): line is string => Boolean(line));
  const to = [tenantDisplayName(document, context).toUpperCase(), `${text(s.property_name)} - ${text(s.unit_label)}`, text(s.property_locality)];
  const drawBlock = (lines: string[], x: number) => {
    let ly = blockTop - 15;
    lines.forEach((line, index) => {
      for (const part of wrap(line, index === 0 ? bold : regular, index === 0 ? 10.5 : 9.5, 230).slice(0, 2)) {
        page.drawText(part, { x, y: ly, size: index === 0 ? 10.5 : 9.5, font: index === 0 ? bold : regular, color: index === 0 ? INK : MUTED });
        ly -= 13.5;
      }
    });
  };
  drawBlock(from, PAGE.margin);
  drawBlock(to, PAGE.width / 2 + 10);

  if (document.status === "invalidated") {
    page.drawRectangle({ x: PAGE.margin, y: blockTop - 100, width: PAGE.width - PAGE.margin * 2, height: 20, color: RED });
    page.drawText(fr ? "DOCUMENT INVALIDÉ - ORIGINAL CONSERVÉ" : "INVALIDATED DOCUMENT - ORIGINAL RETAINED", {
      x: PAGE.margin + 10, y: blockTop - 94, size: 9, font: bold, color: rgb(1, 1, 1),
    });
  }
}

function drawFooter(page: PDFPage, regular: PDFFont, document: FinancialDocumentRecord, context: DocumentRenderContext = {}) {
  const fr = document.language === "fr";
  page.drawLine({ start: { x: PAGE.margin, y: 42 }, end: { x: PAGE.width - PAGE.margin, y: 42 }, thickness: .5, color: LINE });
  const left = [landlordName(document, context), context.branding?.address].filter(Boolean).join(" · ");
  page.drawText(text(left).slice(0, 90), { x: PAGE.margin, y: 28, size: 7.5, font: regular, color: MUTED });
  rightText(page, fr ? `Généré avec KJORA le ${shortDate(document.issuedOn)} · ${document.templateVersion}` : `Generated with KJORA on ${shortDate(document.issuedOn)} · ${document.templateVersion}`, PAGE.width - PAGE.margin, 28, 7.5, regular, MUTED);
}

function tableRow(page: PDFPage, regular: PDFFont, bold: PDFFont, x: number, width: number, y: number, label: string, value: string, options: { strong?: boolean; red?: boolean; green?: boolean } = {}) {
  const font = options.strong ? bold : regular;
  page.drawText(text(label), { x, y, size: options.strong ? 10 : 9.5, font, color: options.strong ? INK : MUTED });
  rightText(page, value, x + width, y, options.strong ? 10 : 9.5, options.strong || options.red || options.green ? bold : regular, options.red ? RED : options.green ? GREEN : INK);
  page.drawLine({ start: { x, y: y - 7 }, end: { x: x + width, y: y - 7 }, thickness: options.strong ? 1.2 : .45, color: options.strong ? INK : LINE });
}

function columnTitle(page: PDFPage, bold: PDFFont, x: number, width: number, y: number, title: string) {
  page.drawLine({ start: { x, y: y + 14 }, end: { x: x + width, y: y + 14 }, thickness: 1.6, color: INK });
  const safe = text(title);
  page.drawText(safe, { x: x + (width - bold.widthOfTextAtSize(safe, 8)) / 2, y: y + 1, size: 8, font: bold, color: INK });
  page.drawLine({ start: { x, y: y - 7 }, end: { x: x + width, y: y - 7 }, thickness: .45, color: LINE });
}

function drawStandardBody(page: PDFPage, regular: PDFFont, bold: PDFFont, document: FinancialDocumentRecord, context: DocumentRenderContext = {}, images: Images = { logo: null, signature: null, stamp: null }) {
  const s = document.snapshot;
  const fr = document.language === "fr";
  const currency = typeof s.currency === "string" ? s.currency : "XAF";
  const full = PAGE.width - PAGE.margin * 2;
  const colWidth = (full - 28) / 2;
  const leftX = PAGE.margin;
  const rightX = PAGE.margin + colWidth + 28;
  let y = document.status === "invalidated" ? 556 : 590;

  const month = documentMonthLabel(s.period_start, document.language);
  const title = document.type === "due_notice" ? (fr ? "AVIS D'ÉCHÉANCE" : "DUE NOTICE")
    : document.type === "rent_receipt" ? (fr ? "QUITTANCE DE LOYER" : "RENT RECEIPT")
      : (fr ? "REÇU DE PAIEMENT" : "PAYMENT RECEIPT");
  page.drawLine({ start: { x: PAGE.margin, y: y + 24 }, end: { x: PAGE.width - PAGE.margin, y: y + 24 }, thickness: .5, color: LINE });
  centerText(page, month ? `${title} - ${month}` : title, y, 17, bold);
  const legal = document.type === "due_notice"
    ? (fr ? "Ce document est une demande de paiement. Il ne vaut ni reçu ni quittance." : "This document is a payment request. It is neither a receipt nor a rent receipt.")
    : document.type === "rent_receipt"
      ? (fr ? "Le bailleur reconnaît avoir reçu la somme ci-dessous pour la période indiquée et en donne quittance, sous réserve de tous ses droits." : "The landlord acknowledges receipt of the amount below for the stated period, subject to all rights.")
      : (fr ? "Ce reçu atteste un encaissement réel enregistré. Il ne vaut quittance que pour les périodes intégralement soldées." : "This receipt confirms a recorded payment. It is a rent receipt only for fully settled periods.");
  wrap(legal, regular, 7.5, full).forEach((line, index) => centerText(page, line, y - 16 - index * 10, 7.5, regular, MUTED));
  y -= 62;

  // Colonne gauche : locataire / solde.
  columnTitle(page, bold, leftX, colWidth, y, fr ? "LOCATAIRE / SOLDE" : "TENANT / BALANCE");
  columnTitle(page, bold, rightX, colWidth, y, fr ? "DÉTAIL" : "DETAIL");
  let ly = y - 24;
  let ry = y - 24;
  tableRow(page, regular, bold, leftX, colWidth, ly, fr ? "Locataire" : "Tenant", tenantDisplayName(document, context)); ly -= 22;
  tableRow(page, regular, bold, leftX, colWidth, ly, fr ? "Logement" : "Unit", text(s.unit_label)); ly -= 22;

  let totalLabel = "";
  let totalValue = 0;
  let totalSub = "";
  let totalGreen = false;
  let description = "";

  if (document.type === "due_notice") {
    const arrears = Math.max(0, Number(context.arrearsXaf ?? 0));
    const remaining = Number(s.remaining_xaf ?? 0);
    tableRow(page, regular, bold, leftX, colWidth, ly, fr ? "Arriéré avant cette échéance" : "Arrears before this due", money(arrears, currency), { red: arrears > 0 }); ly -= 22;
    if (Number(s.credit_applied_xaf ?? 0) > 0) { tableRow(page, regular, bold, leftX, colWidth, ly, fr ? "Crédit appliqué" : "Credit applied", money(s.credit_applied_xaf, currency), { green: true }); ly -= 22; }
    if (Number(s.payment_allocated_xaf ?? 0) > 0) { tableRow(page, regular, bold, leftX, colWidth, ly, fr ? "Déjà payé sur ce mois" : "Already paid this period", money(s.payment_allocated_xaf, currency), { green: true }); ly -= 22; }
    tableRow(page, regular, bold, rightX, colWidth, ry, fr ? "Loyer" : "Rent", money(s.rent_xaf, currency)); ry -= 22;
    tableRow(page, regular, bold, rightX, colWidth, ry, fr ? "Charges" : "Charges", money(s.recurring_charges_xaf, currency)); ry -= 22;
    if (Number(s.deposit_xaf ?? 0) > 0) { tableRow(page, regular, bold, rightX, colWidth, ry, fr ? "Dépôt" : "Deposit", money(s.deposit_xaf, currency)); ry -= 22; }
    tableRow(page, regular, bold, rightX, colWidth, ry, fr ? "Montant de l'échéance" : "Due amount", money(s.expected_xaf, currency), { strong: true }); ry -= 22;
    tableRow(page, regular, bold, rightX, colWidth, ry, fr ? "Reste sur cette échéance" : "Remaining on this due", money(remaining, currency)); ry -= 22;
    if (arrears > 0) { tableRow(page, regular, bold, rightX, colWidth, ry, fr ? "Report de l'arriéré" : "Arrears carried over", money(arrears, currency), { red: true }); ry -= 22; }
    totalValue = remaining + arrears;
    totalLabel = fr ? "TOTAL À PAYER" : "TOTAL DUE";
    totalSub = arrears > 0 ? (fr ? `dont ${money(remaining, currency)} pour cette échéance` : `including ${money(remaining, currency)} for this due`) : "";
    if (totalValue === 0) { totalSub = fr ? "Rien à payer : échéance couverte" : "Nothing to pay: due covered"; totalGreen = true; }
    description = fr
      ? `Pour la location de ${text(s.unit_label)}, ${text(s.property_name)}, ${text(s.property_locality)}, période du ${shortDate(s.period_start)} au ${shortDate(s.period_end)}, à payer le ${shortDate(s.due_date)}.`
      : `For the lease of ${text(s.unit_label)}, ${text(s.property_name)}, ${text(s.property_locality)}, period ${shortDate(s.period_start)} to ${shortDate(s.period_end)}, due on ${shortDate(s.due_date)}.`;
  } else if (document.type === "rent_receipt") {
    tableRow(page, regular, bold, leftX, colWidth, ly, fr ? "Situation" : "Status", fr ? "Période réglée" : "Period settled", { green: true }); ly -= 22;
    tableRow(page, regular, bold, rightX, colWidth, ry, fr ? "Loyer" : "Rent", money(s.rent_xaf, currency)); ry -= 22;
    tableRow(page, regular, bold, rightX, colWidth, ry, fr ? "Charges" : "Charges", money(s.recurring_charges_xaf, currency)); ry -= 22;
    if (Number(s.deposit_xaf ?? 0) > 0) { tableRow(page, regular, bold, rightX, colWidth, ry, fr ? "Dépôt" : "Deposit", money(s.deposit_xaf, currency)); ry -= 22; }
    tableRow(page, regular, bold, rightX, colWidth, ry, fr ? "Total de la période" : "Period total", money(s.expected_xaf, currency), { strong: true }); ry -= 22;
    totalValue = Number(s.expected_xaf ?? 0);
    totalLabel = fr ? "TOTAL ACQUITTÉ" : "TOTAL SETTLED";
    totalGreen = true;
    description = fr
      ? `Pour la location de ${text(s.unit_label)}, ${text(s.property_name)}, ${text(s.property_locality)}, du ${shortDate(s.period_start)} au ${shortDate(s.period_end)}.`
      : `For the lease of ${text(s.unit_label)}, ${text(s.property_name)}, ${text(s.property_locality)}, from ${shortDate(s.period_start)} to ${shortDate(s.period_end)}.`;
  } else {
    const balance = Number(s.balance_after_xaf ?? 0);
    tableRow(page, regular, bold, leftX, colWidth, ly, fr ? "Solde après paiement" : "Balance after payment",
      balance === 0 ? (fr ? "À jour" : "Up to date") : balance > 0 ? `${fr ? "Crédit" : "Credit"} ${money(balance)}` : `${fr ? "Reste dû" : "Due"} ${money(Math.abs(balance))}`,
      { red: balance < 0, green: balance >= 0 }); ly -= 22;
    tableRow(page, regular, bold, rightX, colWidth, ry, fr ? "Moyen" : "Method", paymentMethodLabel(s.method, document.language)); ry -= 22;
    if (s.external_reference) { tableRow(page, regular, bold, rightX, colWidth, ry, fr ? "Référence" : "Reference", text(s.external_reference)); ry -= 22; }
    tableRow(page, regular, bold, rightX, colWidth, ry, fr ? "Montant reçu" : "Amount received", money(s.amount_xaf), { strong: true }); ry -= 22;
    if (Number(s.linked_due_total_xaf ?? 0) > 0) {
      tableRow(page, regular, bold, rightX, colWidth, ry, fr ? "Échéances concernées" : "Linked dues", money(s.linked_due_total_xaf)); ry -= 22;
      if (Number(s.credit_applied_xaf ?? 0) > 0) { tableRow(page, regular, bold, rightX, colWidth, ry, fr ? "Crédit appliqué" : "Credit applied", money(s.credit_applied_xaf)); ry -= 22; }
      tableRow(page, regular, bold, rightX, colWidth, ry, fr ? "Reste sur ces échéances" : "Remaining on these dues", money(s.linked_due_remaining_xaf), { red: Number(s.linked_due_remaining_xaf ?? 0) > 0 }); ry -= 22;
    }
    if (Number(s.credit_created_xaf ?? 0) > 0) { tableRow(page, regular, bold, rightX, colWidth, ry, fr ? "Crédit créé" : "Credit created", money(s.credit_created_xaf), { green: true }); ry -= 22; }
    totalValue = Number(s.amount_xaf ?? 0);
    totalLabel = fr ? "TOTAL PAYÉ" : "TOTAL PAID";
    totalGreen = true;
    description = fr
      ? `Le locataire a payé ${money(s.amount_xaf)} le ${shortDate(s.payment_date)} par ${paymentMethodLabel(s.method, "fr")} (réf. ${text(s.payment_reference)}), pour la location de ${text(s.unit_label)}, ${text(s.property_name)}.`
      : `The tenant paid ${money(s.amount_xaf)} on ${shortDate(s.payment_date)} by ${paymentMethodLabel(s.method, "en")} (ref. ${text(s.payment_reference)}), for ${text(s.unit_label)}, ${text(s.property_name)}.`;
  }

  // Total et description.
  y = Math.min(ly, ry) - 18;
  page.drawLine({ start: { x: PAGE.margin, y: y + 10 }, end: { x: PAGE.width - PAGE.margin, y: y + 10 }, thickness: .5, color: LINE });
  let dy = y - 10;
  for (const line of wrap(description, regular, 9, full * 0.56)) { page.drawText(line, { x: PAGE.margin, y: dy, size: 9, font: regular, color: INK }); dy -= 13; }
  rightText(page, totalLabel, PAGE.width - PAGE.margin, y - 8, 8.5, bold);
  rightText(page, money(totalValue, currency), PAGE.width - PAGE.margin, y - 34, 22, bold, totalGreen ? GREEN : RED);
  if (totalSub) rightText(page, totalSub, PAGE.width - PAGE.margin, y - 50, 8, regular, MUTED);
  y = Math.min(dy, y - 58) - 14;

  // Moyens de paiement (avis) et texte libre du bailleur.
  const b = context.branding;
  if (document.type === "due_notice" && b?.paymentInstructions) {
    const lines = wrap(`${fr ? "Moyens de paiement : " : "Payment methods: "}${b.paymentInstructions}`, regular, 9, full - 24).slice(0, 4);
    const height = lines.length * 13 + 16;
    page.drawRectangle({ x: PAGE.margin, y: y - height + 10, width: full, height, color: SOFT, borderColor: LINE, borderWidth: .6 });
    lines.forEach((line, index) => page.drawText(line, { x: PAGE.margin + 12, y: y - 4 - index * 13, size: 9, font: regular, color: INK }));
    y -= height + 8;
  }
  const footerText = document.type === "due_notice" ? b?.noticeFooter : b?.receiptFooter;
  if (footerText) {
    for (const line of wrap(footerText, regular, 8.5, full - 14).slice(0, 3)) {
      page.drawRectangle({ x: PAGE.margin, y: y - 4, width: 2.5, height: 13, color: GOLD });
      page.drawText(line, { x: PAGE.margin + 10, y, size: 8.5, font: regular, color: MUTED }); y -= 13;
    }
    y -= 6;
  }

  // Signature du bailleur.
  const signY = Math.max(70, Math.min(y - 70, 150));
  const signX = PAGE.width - PAGE.margin - 170;
  if (images.signature) {
    const scale = Math.min(160 / images.signature.width, 48 / images.signature.height, 1);
    page.drawImage(images.signature, { x: signX + (170 - images.signature.width * scale) / 2, y: signY + 6, width: images.signature.width * scale, height: images.signature.height * scale });
  }
  page.drawLine({ start: { x: signX, y: signY }, end: { x: signX + 170, y: signY }, thickness: .5, color: LINE });
  if (stampWanted(document.type, b)) drawDocumentStamp(page, regular, bold, signX - 120, signY + 14, b, images.stamp ?? null, landlordName(document, context));
  const signLabel = `${landlordName(document, context)}${fr ? " - le bailleur" : " - landlord"}`;
  page.drawText(text(signLabel).slice(0, 48), { x: signX + (170 - bold.widthOfTextAtSize(text(signLabel).slice(0, 48), 8.5)) / 2, y: signY - 13, size: 8.5, font: bold, color: INK });
}

// Le cachet n'apparaît sur les avis / quittances que si le bailleur l'a demandé dans sa fiche.
function stampWanted(type: FinancialDocumentType, branding: DocumentBranding | null | undefined) {
  if (!branding || (branding.stampMode ?? "generated") === "none") return false;
  if (type === "due_notice") return branding.stampOnNotices === true;
  if (type === "rent_receipt" || type === "payment_receipt") return branding.stampOnReceipts === true;
  return false;
}

const STAMP_RED = rgb(163 / 255, 35 / 255, 28 / 255);

// Cachet : image importée (tampon scanné) ou cachet ovale rouge généré à partir de la fiche bailleur.
export function drawStampMark(page: PDFPage, regular: PDFFont, bold: PDFFont, centerX: number, centerY: number, input: {
  mode: StampMode; image: EmbeddedImage | null; company: string; contact: string;
}) {
  if (input.mode === "image" && input.image) {
    const scale = Math.min(150 / input.image.width, 80 / input.image.height, 1);
    const width = input.image.width * scale; const height = input.image.height * scale;
    page.drawImage(input.image, { x: centerX - width / 2, y: centerY - height / 2, width, height, opacity: .92 });
    return;
  }
  page.drawEllipse({ x: centerX, y: centerY, xScale: 74, yScale: 32, rotate: degrees(-7), borderColor: STAMP_RED, borderWidth: 1.5 });
  page.drawEllipse({ x: centerX, y: centerY, xScale: 67, yScale: 25, rotate: degrees(-7), borderColor: STAMP_RED, borderWidth: .5 });
  const company = text(input.company).toUpperCase().slice(0, 28);
  const contact = text(input.contact).slice(0, 34);
  page.drawText(company, { x: centerX - bold.widthOfTextAtSize(company, 8) / 2, y: centerY + 4, size: 8, font: bold, color: STAMP_RED });
  if (contact) page.drawText(contact, { x: centerX - regular.widthOfTextAtSize(contact, 6.5) / 2, y: centerY - 9, size: 6.5, font: regular, color: STAMP_RED });
}

function drawDocumentStamp(page: PDFPage, regular: PDFFont, bold: PDFFont, centerX: number, centerY: number, branding: DocumentBranding | null | undefined, image: EmbeddedImage | null, fallbackName: string) {
  drawStampMark(page, regular, bold, centerX, centerY, {
    mode: branding?.stampMode ?? "generated", image,
    company: branding?.displayName || fallbackName,
    contact: branding?.phone || branding?.address || "",
  });
}

function drawStatement(pdf: PDFDocument, regular: PDFFont, bold: PDFFont, document: FinancialDocumentRecord, context: DocumentRenderContext, images: Images) {
  const entries = Array.isArray(document.snapshot.entries) ? document.snapshot.entries as Record<string, unknown>[] : [];
  let page = pdf.addPage([PAGE.width, PAGE.height]);
  drawHeader(page, bold, regular, document, context, images);
  let y = document.status === "invalidated" ? 540 : 572;
  centerText(page, document.language === "fr" ? "RELEVÉ DE COMPTE" : "ACCOUNT STATEMENT", y, 17, bold); y -= 16;
  centerText(page, `${date(document.snapshot.period_from, document.language)} - ${date(document.snapshot.period_to, document.language)}`, y, 8.5, regular, MUTED); y -= 34;

  const headings = document.language === "fr" ? ["Date", "Opération", "Débit", "Crédit", "Solde"] : ["Date", "Operation", "Debit", "Credit", "Balance"];
  const drawTableHead = () => {
    page.drawRectangle({ x: PAGE.margin, y: y - 4, width: PAGE.width - PAGE.margin * 2, height: 22, color: INK });
    [PAGE.margin + 6, PAGE.margin + 76, PAGE.margin + 260, PAGE.margin + 330, PAGE.margin + 402].forEach((x, index) => page.drawText(headings[index], { x, y: y + 3, size: 7.5, font: bold, color: rgb(1, 1, 1) }));
    y -= 22;
  };
  drawTableHead();
  for (const entry of entries) {
    if (y < 76) { drawFooter(page, regular, document, context); page = pdf.addPage([PAGE.width, PAGE.height]); drawHeader(page, bold, regular, document, context, images); y = 572; drawTableHead(); }
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
  tableRow(page, regular, bold, PAGE.margin, PAGE.width - PAGE.margin * 2, y, document.language === "fr" ? "Solde de clôture" : "Closing balance", money(document.snapshot.closing_balance_xaf), { strong: true });
  drawFooter(page, regular, document, context);
}

export async function generateFinancialDocumentPdf(document: FinancialDocumentRecord, context: DocumentRenderContext = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${labels(document.type, document.language)} · ${document.reference}`);
  pdf.setAuthor("KJORA");
  pdf.setCreator(`KJORA ${document.templateVersion}`);
  pdf.setCreationDate(new Date(`${document.issuedOn}T12:00:00Z`));
  pdf.setModificationDate(new Date(`${document.issuedOn}T12:00:00Z`));
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const images: Images = {
    logo: await embedImage(pdf, context.branding?.logoDataUrl),
    signature: await embedImage(pdf, context.branding?.signatureDataUrl),
    stamp: context.branding?.stampMode === "image" ? await embedImage(pdf, context.branding?.stampDataUrl) : null,
  };
  if (document.type === "account_statement") drawStatement(pdf, regular, bold, document, context, images);
  else {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    drawHeader(page, bold, regular, document, context, images);
    drawStandardBody(page, regular, bold, document, context, images);
    drawFooter(page, regular, document, context);
  }
  return pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 });
}
