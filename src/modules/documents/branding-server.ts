import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DocumentBranding } from "@/modules/documents/pdf";
import { parseDocumentBranding } from "@/modules/documents/render-context";

export const EMPTY_BRANDING: DocumentBranding = {
  displayName: null, representative: null, phone: null, email: null, address: null,
  paymentInstructions: null, noticeFooter: null, receiptFooter: null, logoDataUrl: null, signatureDataUrl: null,
  civility: null, stampMode: "generated", stampDataUrl: null, stampOnContracts: true, stampOnReceipts: false, stampOnNotices: false,
};

const BASE_COLUMNS = "display_name, representative, phone, email, address, payment_instructions, notice_footer, receipt_footer, logo_data_url, signature_data_url";
const STAMP_COLUMNS = "civility, stamp_mode, stamp_data_url, stamp_on_contracts, stamp_on_receipts, stamp_on_notices";

type Row = Record<string, string | boolean | null>;

// Lecture de la fiche bailleur (RLS : membres actifs). Tolérante si la migration n'est pas encore passée.
// Si la fiche est vide mais qu'un cachet de contrat existe déjà, on le reprend pour pré-remplir (pas de double saisie).
export async function getDocumentBranding(organizationId: string): Promise<{ available: boolean; stampAvailable: boolean; branding: DocumentBranding }> {
  const supabase = await createSupabaseServerClient();
  let stampAvailable = true;
  let result = await supabase.from("organization_document_settings").select(`${BASE_COLUMNS}, ${STAMP_COLUMNS}`).eq("organization_id", organizationId).maybeSingle();
  if (result.error) {
    stampAvailable = false;
    result = await supabase.from("organization_document_settings").select(BASE_COLUMNS).eq("organization_id", organizationId).maybeSingle();
  }
  if (result.error) return { available: false, stampAvailable: false, branding: EMPTY_BRANDING };
  const row = result.data as Row | null;
  if (!row) {
    const legacy = await supabase.rpc("get_organization_contract_settings", { target_organization_id: organizationId });
    const stamp = Array.isArray(legacy.data) ? legacy.data[0] as Row | undefined : undefined;
    if (legacy.error || !stamp) return { available: true, stampAvailable, branding: EMPTY_BRANDING };
    const representative = [stamp.stamp_first_name, stamp.stamp_last_name].filter(Boolean).join(" ") || (stamp.stamp_name as string | null);
    return {
      available: true, stampAvailable,
      branding: {
        ...EMPTY_BRANDING,
        displayName: (stamp.stamp_company as string | null) ?? null, representative: representative || null,
        phone: (stamp.stamp_phone as string | null) ?? null, address: (stamp.stamp_short_address as string | null) ?? null,
        civility: stamp.stamp_civility === "M." || stamp.stamp_civility === "Mme" ? stamp.stamp_civility : null,
        stampMode: stamp.stamp_enabled === false ? "none" : "generated",
      },
    };
  }
  return {
    available: true, stampAvailable,
    branding: parseDocumentBranding({
      displayName: row.display_name, representative: row.representative, phone: row.phone, email: row.email,
      address: row.address, paymentInstructions: row.payment_instructions, noticeFooter: row.notice_footer,
      receiptFooter: row.receipt_footer, logoDataUrl: row.logo_data_url, signatureDataUrl: row.signature_data_url,
      civility: row.civility, stampMode: row.stamp_mode, stampDataUrl: row.stamp_data_url,
      stampOnContracts: row.stamp_on_contracts, stampOnReceipts: row.stamp_on_receipts, stampOnNotices: row.stamp_on_notices,
    }) ?? EMPTY_BRANDING,
  };
}
