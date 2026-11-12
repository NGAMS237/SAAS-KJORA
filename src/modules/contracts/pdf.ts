import { degrees, PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { LeaseContract } from "./model.ts";
import { drawStampMark, embedImage, type DocumentBranding } from "../documents/pdf.ts";
import { renderContractSections } from "./model.ts";

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const INK = rgb(31 / 255, 45 / 255, 39 / 255);
const GOLD = rgb(201 / 255, 164 / 255, 106 / 255);
const MUTED = rgb(92 / 255, 99 / 255, 94 / 255);
// CONTRATS-UX-PILOTE-01 — le cachet doit être visuellement distinct d'une
// signature électronique (texte noir aligné à gauche) : rouge, ovale,
// légèrement pivoté, comme un tampon encreur classique — jamais confondu
// avec la ligne de signature qui le précède dans le document.
const STAMP_RED = rgb(163 / 255, 35 / 255, 28 / 255);

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

type Embedded = Awaited<ReturnType<typeof embedImage>>;
type ContractImages = { logo: Embedded; signature: Embedded; stamp: Embedded };

// En-tête : logo du bailleur (fiche « Mes informations bailleur ») dans un cartouche blanc, sinon la marque.
function drawHeader(page: PDFPage, bold: PDFFont, regular: PDFFont, contract: LeaseContract, branding: DocumentBranding | null = null, images: ContractImages | null = null) {
  const organization = contract.dataSnapshot.organization as Record<string, unknown> | undefined;
  page.drawRectangle({ x: 0, y: PAGE.height - 118, width: PAGE.width, height: 118, color: INK });
  page.drawRectangle({ x: PAGE.margin, y: PAGE.height - 38, width: 48, height: 4, color: GOLD });
  const name = safe(branding?.displayName || organization?.name);
  if (images?.logo) {
    const scale = Math.min(110 / images.logo.width, 46 / images.logo.height, 1);
    const width = images.logo.width * scale; const height = images.logo.height * scale;
    page.drawRectangle({ x: PAGE.margin - 6, y: PAGE.height - 98, width: width + 12, height: height + 12, color: rgb(1,1,1) });
    page.drawImage(images.logo, { x: PAGE.margin, y: PAGE.height - 92, width, height });
    page.drawText(name, { x: PAGE.margin + width + 18, y: PAGE.height - 72, size: 11, font: bold, color: rgb(1,1,1) });
    if (branding?.phone || branding?.address) page.drawText(safe([branding?.phone, branding?.address].filter(Boolean).join(" · ")).slice(0, 60), { x: PAGE.margin + width + 18, y: PAGE.height - 86, size: 8, font: regular, color: rgb(.85,.89,.86) });
  } else {
    page.drawText("KJORA", { x: PAGE.margin, y: PAGE.height - 64, size: 18, font: bold, color: rgb(1,1,1) });
    page.drawText(name, { x: PAGE.margin, y: PAGE.height - 86, size: 9, font: regular, color: rgb(.85,.89,.86) });
  }
  const title = contract.language === "fr" ? "Contrat de location" : "Lease agreement";
  page.drawText(title, { x: PAGE.width - PAGE.margin - bold.widthOfTextAtSize(title, 19), y: PAGE.height - 64, size: 19, font: bold, color: rgb(1,1,1) });
  page.drawText(contract.reference, { x: PAGE.width - PAGE.margin - regular.widthOfTextAtSize(contract.reference, 9), y: PAGE.height - 86, size: 9, font: regular, color: rgb(.85,.89,.86) });
}

// branding : fiche bailleur (logo, signature enregistrée, cachet importé). Facultatif : sans elle, rendu historique.
export async function generateContractPdf(contract: LeaseContract, branding: DocumentBranding | null = null) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${contract.reference} · KJORA`); pdf.setAuthor("KJORA"); pdf.setCreator(`KJORA contract template v${contract.templateVersion}`);
  const frozenDate = new Date(contract.createdAt);
  if (!Number.isNaN(frozenDate.getTime())) { pdf.setCreationDate(frozenDate); pdf.setModificationDate(frozenDate); }
  const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const images: ContractImages = {
    logo: await embedImage(pdf, branding?.logoDataUrl),
    signature: await embedImage(pdf, branding?.signatureDataUrl),
    stamp: branding?.stampMode === "image" ? await embedImage(pdf, branding?.stampDataUrl) : null,
  };
  let page = pdf.addPage([PAGE.width, PAGE.height]); drawHeader(page, bold, regular, contract, branding, images); let y = 685;
  const sections = renderContractSections(contract.contentSnapshot, contract.dataSnapshot);
  for (const section of sections) {
    const bodyLines = wrap(section.body, regular, 9.5, PAGE.width - PAGE.margin * 2);
    if (y - 28 - bodyLines.length * 13 < 100) { page = pdf.addPage([PAGE.width,PAGE.height]); drawHeader(page,bold,regular,contract,branding,images); y=685; }
    page.drawText(safe(section.title), { x: PAGE.margin, y, size: 12, font: bold, color: INK }); y -= 20;
    for (const line of bodyLines) { page.drawText(line, { x: PAGE.margin, y, size: 9.5, font: regular, color: MUTED }); y -= 13; }
    y -= 15;
  }
  if (y < 250) { page = pdf.addPage([PAGE.width,PAGE.height]); drawHeader(page,bold,regular,contract,branding,images); y=685; }
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
  // Bloc de signatures : signature enregistrée du bailleur (image) une fois qu'il a signé.
  const ownerSigned = contract.signatures.some((signature) => signature.party === "owner");
  if (ownerSigned && images.signature) {
    if (y < 190) { page = pdf.addPage([PAGE.width,PAGE.height]); drawHeader(page,bold,regular,contract,branding,images); y=685; }
    const scale = Math.min(150 / images.signature.width, 50 / images.signature.height, 1);
    const blockX = PAGE.width - PAGE.margin - 170;
    page.drawText(contract.language === "fr" ? "Le bailleur" : "The lessor", { x: blockX, y, size: 9, font: bold, color: INK });
    page.drawImage(images.signature, { x: blockX + (170 - images.signature.width * scale) / 2, y: y - 60, width: images.signature.width * scale, height: images.signature.height * scale });
    page.drawLine({ start: { x: blockX, y: y - 64 }, end: { x: blockX + 170, y: y - 64 }, thickness: .5, color: GOLD });
    const signer = safe([branding?.civility, branding?.representative].filter(Boolean).join(" ") || branding?.displayName || "");
    if (signer) page.drawText(signer.slice(0, 40), { x: blockX, y: y - 76, size: 8, font: regular, color: MUTED });
  }
  if (contract.stampSnapshot.enabled && branding?.stampMode === "image" && images.stamp && branding.stampOnContracts !== false) {
    // Tampon scanné importé par le bailleur, à la place du cachet généré.
    const footer = contract.stampSnapshot.position === "footer";
    drawStampMark(page, regular, bold, footer ? PAGE.width - PAGE.margin - 87 : PAGE.margin + 87, footer ? 92 : y - 32, { mode: "image", image: images.stamp, company: "", contact: "" });
  } else if (contract.stampSnapshot.enabled) {
    // CONTRATS-UX-PILOTE-01 — cachet rouge, ovale, légèrement pivoté : un
    // tampon encreur classique, pour qu'il ne soit jamais confondu avec la
    // ligne de signature électronique juste au-dessus (texte noir, méthode/
    // horodatage/SHA-256). Le contenu (company puis name, jamais fabriqué)
    // est inchangé par rapport à la version précédente.
    const footer = contract.stampSnapshot.position === "footer";
    const centerX = footer ? PAGE.width - PAGE.margin - 87 : PAGE.margin + 87;
    const centerY = footer ? 92 : y - 32;
    page.drawEllipse({ x: centerX, y: centerY, xScale: 88, yScale: 38, rotate: degrees(-7), borderColor: STAMP_RED, borderWidth: 1.6 });
    page.drawEllipse({ x: centerX, y: centerY, xScale: 80, yScale: 30, rotate: degrees(-7), borderColor: STAMP_RED, borderWidth: 0.6 });
    const company = safe(contract.stampSnapshot.company ?? contract.stampSnapshot.name ?? "KJORA");
    const contact = safe(contract.stampSnapshot.phone ?? contract.stampSnapshot.address ?? "");
    page.drawText(company.toUpperCase(), { x: centerX - bold.widthOfTextAtSize(company.toUpperCase(), 9) / 2, y: centerY + 6, size: 9, font: bold, color: STAMP_RED });
    page.drawText(contact, { x: centerX - regular.widthOfTextAtSize(contact, 7) / 2, y: centerY - 10, size: 7, font: regular, color: STAMP_RED });
  }
  page.drawText(`SHA-256: ${safe(contract.contentSha256 ?? contract.finalSha256 ?? "pending")}`, { x:PAGE.margin,y:45,size:7,font:regular,color:MUTED });
  return pdf.save({ useObjectStreams:false, addDefaultPage:false, objectsPerTick:50 });
}
