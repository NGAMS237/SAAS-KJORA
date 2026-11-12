// Contexte de rendu des documents (bailleur, civilité, arriéré) — lecture tolérante :
// en cas d'erreur (droits, migration absente), le document est rendu sans ces informations.
import type { DocumentBranding, DocumentRenderContext } from "./pdf.ts";

type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

const str = (value: unknown, max = 700_000) => (typeof value === "string" && value.trim() ? value.slice(0, max) : null);

export function parseDocumentBranding(value: unknown): DocumentBranding | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const image = (input: unknown) => {
    const s = str(input);
    return s && /^data:image\/(png|jpeg);base64,/.test(s) ? s : null;
  };
  return {
    displayName: str(v.displayName, 120), representative: str(v.representative, 120), phone: str(v.phone, 40),
    email: str(v.email, 160), address: str(v.address, 240), paymentInstructions: str(v.paymentInstructions, 500),
    noticeFooter: str(v.noticeFooter, 300), receiptFooter: str(v.receiptFooter, 300),
    logoDataUrl: image(v.logoDataUrl), signatureDataUrl: image(v.signatureDataUrl),
    civility: v.civility === "M." || v.civility === "Mme" ? v.civility : null,
    stampMode: v.stampMode === "image" || v.stampMode === "none" ? v.stampMode : "generated",
    stampDataUrl: image(v.stampDataUrl),
    stampOnContracts: v.stampOnContracts !== false,
    stampOnReceipts: v.stampOnReceipts === true,
    stampOnNotices: v.stampOnNotices === true,
  };
}

export function parseDocumentRenderContext(value: unknown): DocumentRenderContext {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  const arrears = Number(v.arrearsXaf ?? 0);
  return {
    branding: parseDocumentBranding(v.branding),
    tenantCivility: v.tenantCivility === "M." || v.tenantCivility === "Mme" ? v.tenantCivility : null,
    arrearsXaf: Number.isFinite(arrears) && arrears > 0 ? Math.round(arrears) : 0,
  };
}

export async function loadDocumentRenderContext(client: RpcClient, documentId: string, portalAccessId?: string | null): Promise<DocumentRenderContext> {
  try {
    const result = await client.rpc("get_document_render_context", {
      target_document_id: documentId,
      target_portal_access_id: portalAccessId ?? null,
    });
    return result.error ? {} : parseDocumentRenderContext(result.data);
  } catch {
    return {};
  }
}
