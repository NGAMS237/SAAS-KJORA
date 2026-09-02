import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { parseContractId, parseSignatureRequest } from "@/modules/contracts/model";
import { getPortalContract, materializeContract } from "@/modules/contracts/server";
import { ACTIVE_PORTAL_ACCESS_COOKIE } from "@/tenant-portal/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const accessId = (await cookies()).get(ACTIVE_PORTAL_ACCESS_COOKIE)?.value;
  if (!accessId) return NextResponse.json({ error: "not_found" }, { status: 404 });
  let input: Record<string, unknown>;
  try { input = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const contractId = parseContractId(input.contractId);
  if (!contractId) return NextResponse.json({ error: "invalid_contract" }, { status: 400 });
  const { applyAuthState, supabase } = createSupabaseRouteHandlerClient(request);
  const contract = await getPortalContract(accessId, contractId);
  if (!contract) return applyAuthState(NextResponse.json({ error: "not_found" }, { status: 404 }));
  if (input.action === "sign") {
    const parsed = parseSignatureRequest(input);
    if (!parsed.ok || !contract.contentSha256) return applyAuthState(NextResponse.json({ error: parsed.ok ? "contract_not_ready" : parsed.error }, { status: 400 }));
    const consentText = contract.language === "fr" ? "Je confirme avoir lu et accepté cette version exacte du contrat." : "I confirm that I have read and accepted this exact contract version.";
    const result = await supabase.rpc("sign_lease_contract_tenant", { target_access_id: accessId, target_contract_id: contract.id, target_method: parsed.value.method, target_signature: parsed.value.signature, target_consent_text: consentText, target_sha256: contract.contentSha256 });
    if (result.error) return applyAuthState(NextResponse.json({ error: result.error.message }, { status: 400 }));
    const signed = await getPortalContract(accessId, contract.id);
    if (!signed) return applyAuthState(NextResponse.json({ error: "finalization_failed" }, { status: 500 }));
    await materializeContract(signed, accessId);
    return applyAuthState(NextResponse.json({ signatureId: result.data }));
  }
  if (input.action === "finalize" && contract.status === "tenant_signed") {
    await materializeContract(contract, accessId); return applyAuthState(NextResponse.json({ contractId }));
  }
  return applyAuthState(NextResponse.json({ error: "unsupported_action" }, { status: 400 }));
}
