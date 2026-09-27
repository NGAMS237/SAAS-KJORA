// =============================================================================
// KJORA — Facture / reçu d'abonnement SaaS (REVENUE-01B)
// =============================================================================
// Module PUR : aucun accès base, aucun secret, aucun `server-only`. Même
// principe que `src/modules/documents/pdf.ts` (loyers), en plus simple et
// strictement séparé : ce document ne représente jamais un encaissement de
// loyer, et un encaissement de loyer n'est jamais rendu par ce module.
//
// Bilingue FR/EN. Ne mentionne jamais un nom de provider (Stripe, Flutterwave,
// CamPay, ElyonPay...) : un règlement manuel n'a et ne doit avoir aucun
// fournisseur associé — voir REVENUE-LAUNCH-01, décision verrouillée.
// =============================================================================

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { isReceiptAvailable, type InvoiceStatus } from "./model.ts";
import type { PlanSlug } from "../entitlements/model.ts";

export type InvoiceDocumentLanguage = "fr" | "en";

export type BillingInvoicePdfInput = {
  organizationName: string;
  number: string;
  plan: PlanSlug;
  planLabel: string;
  billingCycleLabel: string;
  /** Toujours XAF pour un document émis par ce module (REVENUE-01B, portée Afrique). */
  currency: "XAF";
  amountMinor: number;
  periodStart: string;
  periodEnd: string;
  issuedOn: string;
  status: InvoiceStatus;
  paidAt: string | null;
  manualReference: string | null;
  language: InvoiceDocumentLanguage;
};

const INK = rgb(19 / 255, 37 / 255, 58 / 255);
const GOLD = rgb(200 / 255, 137 / 255, 47 / 255);
const MUTED = rgb(83 / 255, 99 / 255, 112 / 255);
const PAGE = { width: 595.28, height: 841.89, margin: 48 };

function text(value: unknown) {
  return String(value ?? "—")
    .replace(/[  ]/g, " ")
    .replaceAll("œ", "oe").replaceAll("Œ", "OE")
    .replace(/[‘’]/g, "'").replace(/[–—]/g, "-")
    .replace(/[^\u0009\u000A\u000D -~ -ÿ]/g, "?");
}

function money(minor: number) {
  // XAF uniquement dans ce module : jamais divisé par 100 (devise sans décimale).
  return `${minor.toLocaleString("fr-FR")} XAF`;
}

function date(value: string, language: InvoiceDocumentLanguage) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return "—";
  return new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-GB", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

/** Titre du document : une facture avant paiement, un reçu seulement après. */
export function invoiceDocumentTitle(status: InvoiceStatus, language: InvoiceDocumentLanguage): string {
  if (isReceiptAvailable(status)) return language === "fr" ? "Reçu d'abonnement" : "Subscription receipt";
  return language === "fr" ? "Facture d'abonnement" : "Subscription invoice";
}

function row(page: PDFPage, regular: PDFFont, bold: PDFFont, y: number, label: string, value: string) {
  page.drawText(text(label), { x: PAGE.margin, y, size: 9, font: regular, color: MUTED });
  const safeValue = text(value);
  const width = bold.widthOfTextAtSize(safeValue, 10);
  page.drawText(safeValue, {
    x: Math.max(PAGE.margin + 220, PAGE.width - PAGE.margin - width), y, size: 10, font: bold, color: INK,
  });
  page.drawLine({
    start: { x: PAGE.margin, y: y - 7 }, end: { x: PAGE.width - PAGE.margin, y: y - 7 },
    thickness: 0.5, color: rgb(0.84, 0.87, 0.89),
  });
}

/**
 * Génère la facture/reçu d'abonnement SaaS en PDF. Ne représente jamais un
 * paiement de loyer et n'appelle jamais un fournisseur de paiement : le
 * document décrit un fait déjà enregistré en base, rien de plus.
 */
export async function generateBillingInvoicePdf(input: BillingInvoicePdfInput): Promise<Uint8Array> {
  const fr = input.language === "fr";
  const title = invoiceDocumentTitle(input.status, input.language);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${title} · ${input.number}`);
  pdf.setAuthor("KJORA");
  pdf.setCreationDate(new Date(`${input.issuedOn}T12:00:00Z`));
  pdf.setModificationDate(new Date(`${input.issuedOn}T12:00:00Z`));

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([PAGE.width, PAGE.height]);

  page.drawRectangle({ x: 0, y: PAGE.height - 128, width: PAGE.width, height: 128, color: INK });
  page.drawRectangle({ x: PAGE.margin, y: PAGE.height - 42, width: 52, height: 4, color: GOLD });
  page.drawText("KJORA", { x: PAGE.margin, y: PAGE.height - 70, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText(text(input.organizationName), {
    x: PAGE.margin, y: PAGE.height - 92, size: 9, font: regular, color: rgb(0.85, 0.89, 0.92),
  });
  const titleWidth = bold.widthOfTextAtSize(title, 19);
  page.drawText(title, {
    x: PAGE.width - PAGE.margin - titleWidth, y: PAGE.height - 69, size: 19, font: bold, color: rgb(1, 1, 1),
  });
  const refWidth = regular.widthOfTextAtSize(input.number, 9);
  page.drawText(input.number, {
    x: PAGE.width - PAGE.margin - refWidth, y: PAGE.height - 92, size: 9, font: regular, color: rgb(0.85, 0.89, 0.92),
  });

  let y = 680;
  row(page, regular, bold, y, fr ? "Plan" : "Plan", input.planLabel); y -= 34;
  row(page, regular, bold, y, fr ? "Cycle" : "Billing cycle", input.billingCycleLabel); y -= 34;
  row(page, regular, bold, y, fr ? "Période" : "Period",
    `${date(input.periodStart, input.language)} - ${date(input.periodEnd, input.language)}`); y -= 34;
  row(page, regular, bold, y, fr ? "Émise le" : "Issued on", date(input.issuedOn, input.language)); y -= 34;
  row(page, regular, bold, y, fr ? "Montant" : "Amount", money(input.amountMinor)); y -= 34;

  if (isReceiptAvailable(input.status)) {
    row(page, regular, bold, y, fr ? "Réglée le" : "Paid on",
      input.paidAt ? date(input.paidAt, input.language) : "—"); y -= 34;
    if (input.manualReference) {
      row(page, regular, bold, y, fr ? "Référence de règlement" : "Payment reference", input.manualReference); y -= 34;
    }
  }

  y -= 40;
  const note = isReceiptAvailable(input.status)
    ? (fr
      ? "Ce reçu atteste un règlement manuel enregistré par un administrateur KJORA. Aucun fournisseur de paiement en ligne n'est associé à ce règlement."
      : "This receipt confirms a manual payment recorded by a KJORA administrator. No online payment provider is associated with this payment.")
    : (fr
      ? "Cette facture correspond à un abonnement KJORA émis par STE VERALUZ SARL, à régler hors ligne (Mobile Money, virement, espèces). Elle ne constitue pas un reçu tant qu'aucun règlement n'a été confirmé."
      : "This invoice corresponds to a KJORA subscription issued by STE VERALUZ SARL, to be settled offline (Mobile Money, bank transfer, cash). It is not a receipt until a payment has been confirmed.");
  const words = text(note).split(/\s+/);
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (regular.widthOfTextAtSize(candidate, 9) <= PAGE.width - PAGE.margin * 2) line = candidate;
    else { page.drawText(line, { x: PAGE.margin, y, size: 9, font: regular, color: MUTED }); y -= 13; line = word; }
  }
  if (line) page.drawText(line, { x: PAGE.margin, y, size: 9, font: regular, color: MUTED });

  const footer = fr
    ? `Généré par KJORA le ${date(input.issuedOn, "fr")}`
    : `Generated by KJORA on ${date(input.issuedOn, "en")}`;
  page.drawLine({
    start: { x: PAGE.margin, y: 45 }, end: { x: PAGE.width - PAGE.margin, y: 45 }, thickness: 0.75, color: GOLD,
  });
  page.drawText(text(footer), { x: PAGE.margin, y: 29, size: 7.5, font: regular, color: MUTED });

  return pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 });
}
