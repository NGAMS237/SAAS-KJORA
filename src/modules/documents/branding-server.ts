import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DocumentBranding } from "@/modules/documents/pdf";
import { parseDocumentBranding } from "@/modules/documents/render-context";

export const EMPTY_BRANDING: DocumentBranding = {
  displayName: null, representative: null, phone: null, email: null, address: null,
  paymentInstructions: null, noticeFooter: null, receiptFooter: null, logoDataUrl: null, signatureDataUrl: null,
};

// Lecture des informations bailleur de l'Organization (RLS : membres actifs). Tolérante si la table n'existe pas encore.
export async function getDocumentBranding(organizationId: string): Promise<{ available: boolean; branding: DocumentBranding }> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.from("organization_document_settings")
    .select("display_name, representative, phone, email, address, payment_instructions, notice_footer, receipt_footer, logo_data_url, signature_data_url")
    .eq("organization_id", organizationId).maybeSingle();
  if (result.error) return { available: false, branding: EMPTY_BRANDING };
  const row = result.data as Record<string, string | null> | null;
  if (!row) return { available: true, branding: EMPTY_BRANDING };
  return {
    available: true,
    branding: parseDocumentBranding({
      displayName: row.display_name, representative: row.representative, phone: row.phone, email: row.email,
      address: row.address, paymentInstructions: row.payment_instructions, noticeFooter: row.notice_footer,
      receiptFooter: row.receipt_footer, logoDataUrl: row.logo_data_url, signatureDataUrl: row.signature_data_url,
    }) ?? EMPTY_BRANDING,
  };
}
