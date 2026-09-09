import { NextResponse, type NextRequest } from "next/server";
import { getActiveAuthorization } from "@/core/authorization/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { parseContractId, parseSignatureRequest, validateControlledSections } from "@/modules/contracts/model";
import { getLeaseContract, hashContractContent, preparedContractContent } from "@/modules/contracts/server";

export const runtime = "nodejs";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const authorization = await getActiveAuthorization();
  if (!authorization) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!authorization.capabilities.includes("contract.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let input: Record<string, unknown>;
  try { input = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const { applyAuthState, supabase } = createSupabaseRouteHandlerClient(request);

  if (input.action === "save_settings") {
    const position=input.position==="footer"?"footer":"signature_block";
    const result=await supabase.rpc("save_organization_contract_settings",{ target_organization_id:authorization.organizationId,target_enabled:input.enabled===true,target_name:typeof input.name==="string"?input.name:"",target_company:typeof input.company==="string"?input.company:"",target_phone:typeof input.phone==="string"?input.phone:"",target_address:typeof input.address==="string"?input.address:"",target_position:position });
    return result.error?applyAuthState(NextResponse.json({error:result.error.message},{status:400})):applyAuthState(NextResponse.json({organizationId:result.data}));
  }
  if(input.action==="duplicate_template") {
    const templateId=parseContractId(input.templateId); const name=typeof input.name==="string"?input.name:"";
    if(!templateId) return applyAuthState(NextResponse.json({error:"invalid_template"},{status:400}));
    const result=await supabase.rpc("duplicate_contract_template",{target_organization_id:authorization.organizationId,target_template_id:templateId,target_name:name});
    return result.error?applyAuthState(NextResponse.json({error:result.error.message},{status:400})):applyAuthState(NextResponse.json({templateId:result.data}));
  }
  if(input.action==="version_template") {
    const templateId=parseContractId(input.templateId); const sections=input.sections;
    if(!templateId||!validateControlledSections(sections)) return applyAuthState(NextResponse.json({error:"invalid_template"},{status:400}));
    const result=await supabase.rpc("create_contract_template_version",{target_template_id:templateId,target_name:typeof input.name==="string"?input.name:"",target_sections:sections,target_make_default:input.makeDefault===true});
    return result.error?applyAuthState(NextResponse.json({error:result.error.message},{status:400})):applyAuthState(NextResponse.json({templateId:result.data}));
  }

  if (input.action === "generate") {
    const leaseId = parseContractId(input.leaseId); const templateId = parseContractId(input.templateId);
    if (!leaseId || !templateId) return applyAuthState(NextResponse.json({ error: "invalid_request" }, { status: 400 }));
    const result = await supabase.rpc("generate_lease_contract", { target_lease_id: leaseId, target_template_id: templateId });
    return result.error ? applyAuthState(NextResponse.json({ error: result.error.message }, { status: 409 })) : applyAuthState(NextResponse.json({ contractId: result.data }));
  }

  const contractId = parseContractId(input.contractId);
  if (!contractId) return applyAuthState(NextResponse.json({ error: "invalid_contract" }, { status: 400 }));
  const contract = await getLeaseContract(authorization.organizationId, contractId);
  if (!contract) return applyAuthState(NextResponse.json({ error: "not_found" }, { status: 404 }));

  if (input.action === "validate") {
    const content = preparedContractContent(contract); const sha256 = hashContractContent(contract, content);
    const result = await supabase.rpc("validate_lease_contract", { target_contract_id: contract.id, target_content: content, target_sha256: sha256 });
    return result.error ? applyAuthState(NextResponse.json({ error: result.error.message }, { status: 400 })) : applyAuthState(NextResponse.json({ contractId, sha256 }));
  }
  if (input.action === "owner_sign") {
    const parsed = parseSignatureRequest(input);
    if (!parsed.ok || !contract.contentSha256) return applyAuthState(NextResponse.json({ error: parsed.ok ? "contract_not_ready" : parsed.error }, { status: 400 }));
    const consentText = contract.language === "fr" ? "Je confirme avoir lu et accepté cette version exacte du contrat." : "I confirm that I have read and accepted this exact contract version.";
    const result = await supabase.rpc("sign_lease_contract_owner", { target_contract_id: contract.id, target_method: parsed.value.method, target_signature: parsed.value.signature, target_consent_text: consentText, target_sha256: contract.contentSha256 });
    return result.error ? applyAuthState(NextResponse.json({ error: result.error.message }, { status: 400 })) : applyAuthState(NextResponse.json({ signatureId: result.data }));
  }
  if (input.action === "send") {
    const result = await supabase.rpc("send_lease_contract", { target_contract_id: contract.id });
    return result.error ? applyAuthState(NextResponse.json({ error: result.error.message }, { status: 409 })) : applyAuthState(NextResponse.json({ contractId }));
  }
  if (input.action === "cancel") {
    const reason = typeof input.reason === "string" ? input.reason : "";
    const result = await supabase.rpc("cancel_lease_contract", { target_contract_id: contract.id, target_reason: reason });
    return result.error ? applyAuthState(NextResponse.json({ error: result.error.message }, { status: 400 })) : applyAuthState(NextResponse.json({ contractId }));
  }
  return applyAuthState(NextResponse.json({ error: "unsupported_action" }, { status: 400 }));
}
