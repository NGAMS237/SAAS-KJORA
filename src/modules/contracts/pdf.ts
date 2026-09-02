import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { LeaseContract } from "./model.ts";
import { renderContractSections } from "./model.ts";

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const INK = rgb(31 / 255, 45 / 255, 39 / 255);
const GOLD = rgb(201 / 255, 164 / 255, 106 / 255);
const MUTED = rgb(92 / 255, 99 / 255, 94 / 255);

function safe(value: unknown) {
  return String(value ?? "—").replace(/[  ]/g, " ").replaceAll("œ", "oe").replaceAll("Œ", "OE")
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014]/g, "-").replace(/[^\u0009\u000A\u000D\u0020-\u007E\u00A0-\u00FF]/g, "?");
}

function wrap(content: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = []; let line = "";
  for (const word of safe(content).split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
    else { if (line) lines.push(line); line = word; }
  }
  if (line) lines.push(line); return lines;
}

function drawHeader(page: PDFPage, bold: PDFFont, regular: PDFFont, contract: LeaseContract) {
  const organization = contract.dataSnapshot.organization as Record<string, unknown> | undefined;
  page.drawRectangle({ x: 0, y: PAGE.height - 118, width: PAGE.width, height: 118, color: INK });
  page.drawRectangle({ x: PAGE.margin, y: PAGE.height - 38, width: 48, height: 4, color: GOLD });
  page.drawText("KJORA", { x: PAGE.margin, y: PAGE.height - 64, size: 18, font: bold, color: rgb(1,1,1) });
  page.drawText(safe(organization?.name), { x: PAGE.margin, y: PAGE.height - 86, size: 9, font: regular, color: rgb(.85,.89,.86) });
  const title = contract.language === "fr" ? "Contrat de location" : "Lease agreement";
  page.drawText(title, { x: PAGE.width - PAGE.margin - bold.widthOfTextAtSize(title, 19), y: PAGE.height - 64, size: 19, font: bold, color: rgb(1,1,1) });
  page.drawText(contract.reference, { x: PAGE.width - PAGE.margin - regular.widthOfTextAtSize(contract.reference, 9), y: PAGE.height - 86, size: 9, font: regular, color: rgb(.85,.89,.86) });
}

export async function generateContractPdf(contract: LeaseContract) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${contract.reference} · KJORA`); pdf.setAuthor("KJORA"); pdf.setCreator(`KJORA contract template v${contract.templateVersion}`);
  const frozenDate = new Date(contract.createdAt);
  if (!Number.isNaN(frozenDate.getTime())) { pdf.setCreationDate(frozenDate); pdf.setModificationDate(frozenDate); }
  const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([PAGE.width, PAGE.height]); drawHeader(page, bold, regular, contract); let y = 685;
  const sections = renderContractSections(contract.contentSnapshot, contract.dataSnapshot);
  for (const section of sections) {
    const bodyLines = wrap(section.body, regular, 9.5, PAGE.width - PAGE.margin * 2);
    if (y - 28 - bodyLines.length * 13 < 100) { page = pdf.addPage([PAGE.width,PAGE.height]); drawHeader(page,bold,regular,contract); y=685; }
    page.drawText(safe(section.title), { x: PAGE.margin, y, size: 12, font: bold, color: INK }); y -= 20;
    for (const line of bodyLines) { page.drawText(line, { x: PAGE.margin, y, size: 9.5, font: regular, color: MUTED }); y -= 13; }
    y -= 15;
  }
  if (y < 250) { page = pdf.addPage([PAGE.width,PAGE.height]); drawHeader(page,bold,regular,contract); y=685; }
  page.drawLine({ start:{x:PAGE.margin,y}, end:{x:PAGE.width-PAGE.margin,y}, thickness:.8, color:GOLD }); y -= 26;
  page.drawText(contract.language === "fr" ? "Preuves de consentement et signatures" : "Consent and signature evidence", { x:PAGE.margin,y,size:12,font:bold,color:INK }); y -= 22;
  page.drawText(contract.language === "fr" ? "Les identités, méthodes, horodatages et l'empreinte du document sont conservés dans le journal KJORA." : "Identities, methods, timestamps and the document fingerprint are retained in the KJORA evidence record.", { x:PAGE.margin,y,size:8.5,font:regular,color:MUTED }); y -= 30;
  for (const signature of contract.signatures) {
    const party = signature.party === "owner" ? (contract.language === "fr" ? "Bailleur" : "Lessor") : (contract.language === "fr" ? "Locataire" : "Tenant");
    const evidence = `${party} · ${signature.method} · ${signature.signedAt} · ${signature.signerUserId.slice(0,8)}…`;
    page.drawText(safe(evidence), { x:PAGE.margin,y,size:8.5,font:bold,color:INK }); y -= 14;
    page.drawText(`SHA-256: ${signature.contentSha256}`, { x:PAGE.margin,y,size:7,font:regular,color:MUTED }); y -= 20;
    if (signature.method === "stylized_name" && typeof signature.signatureData.displayName === "string") {
      page.drawText(safe(signature.signatureData.displayName), { x:PAGE.margin+12,y,size:16,font:bold,color:INK }); y -= 28;
    } else if (signature.method === "drawn" && Array.isArray(signature.signatureData.strokes)) {
      const points=signature.signatureData.strokes.filter((item):item is {x:number;y:number}=>Boolean(item)&&typeof item==="object"&&Number.isFinite((item as {x?:unknown}).x)&&Number.isFinite((item as {y?:unknown}).y));
      for(let index=1;index<points.length;index+=1){const previous=points[index-1];const current=points[index];page.drawLine({start:{x:PAGE.margin+previous.x*.3,y:y+45-previous.y*.3},end:{x:PAGE.margin+current.x*.3,y:y+45-current.y*.3},thickness:1,color:INK});} y-=58;
    }
  }
  if (contract.stampSnapshot.enabled) {
    const stampY=contract.stampSnapshot.position==="footer"?62:y-70;const stampX=contract.stampSnapshot.position==="footer"?PAGE.width-PAGE.margin-175:PAGE.margin;
    page.drawRectangle({ x:stampX,y:stampY,width:175,height:58,borderColor:GOLD,borderWidth:1 });
    page.drawText(safe(contract.stampSnapshot.company ?? contract.stampSnapshot.name ?? "KJORA"), { x:stampX+10,y:stampY+34,size:10,font:bold,color:INK });
    page.drawText(safe(contract.stampSnapshot.phone ?? contract.stampSnapshot.address ?? ""), { x:stampX+10,y:stampY+18,size:7.5,font:regular,color:MUTED });
  }
  page.drawText(`SHA-256: ${safe(contract.contentSha256 ?? contract.finalSha256 ?? "pending")}`, { x:PAGE.margin,y:45,size:7,font:regular,color:MUTED });
  return pdf.save({ useObjectStreams:false, addDefaultPage:false, objectsPerTick:50 });
}
