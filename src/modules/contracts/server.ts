import "server-only";

import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  canonicalContractContent, contractFromRow, renderContractSections,
  type ContractSignatureEvidence, type ContractStampSettings, type ContractTemplateSummary, type ContractTemplateVersion, type LeaseContract,
} from "@/modules/contracts/model";
import { generateContractPdf } from "@/modules/contracts/pdf";

function templateFromRow(row: Record<string, unknown>): ContractTemplateSummary {
  return { id: String(row.template_id), name: String(row.name), language: row.language === "en" ? "en" : "fr",
    version: Number(row.version), isSystem: Boolean(row.is_system), isDefault: Boolean(row.is_default),
    // CONTRATS-UX-PILOTE-01 — déjà renvoyé par list_contract_templates,
    // simplement pas mappé jusqu'ici.
    sections: (row.sections ?? []) as ContractTemplateSummary["sections"] };
}

async function attachSignatures(contract: LeaseContract, accessId: string | null = null) {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("get_lease_contract_signatures", { target_contract_id: contract.id, target_access_id: accessId });
  if (result.error) throw result.error;
  contract.signatures = ((result.data ?? []) as Record<string, unknown>[]).map((row): ContractSignatureEvidence => ({
    party: row.party === "tenant" ? "tenant" : "owner", signerUserId: String(row.signer_user_id),
    method: row.method === "drawn" ? "drawn" : "stylized_name", consentCode: String(row.consent_code),
    consentText: String(row.consent_text), contentSha256: String(row.content_sha256), signedAt: String(row.signed_at),
    signatureData: (row.signature_data ?? {}) as Record<string, unknown>,
  }));
  return contract;
}

export async function getContractTemplates(organizationId: string, language?: "fr" | "en") {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("list_contract_templates", { target_organization_id: organizationId, target_language: language ?? null });
  if (result.error) throw result.error;
  return ((result.data ?? []) as Record<string, unknown>[]).map(templateFromRow);
}

export async function getContractTemplateHistory(organizationId: string): Promise<ContractTemplateVersion[]> {
  const supabase=await createSupabaseServerClient(); const result=await supabase.rpc("list_contract_template_history",{target_organization_id:organizationId});
  if(result.error) throw result.error;
  return ((result.data??[]) as Record<string,unknown>[]).map((row)=>({ id:String(row.template_id),familyKey:String(row.family_key),name:String(row.name),language:row.language==="en"?"en":"fr",version:Number(row.version),status:row.status==="inactive"?"inactive":"active",isSystem:Boolean(row.is_system),isDefault:Boolean(row.is_default),sourceTemplateId:typeof row.source_template_id==="string"?row.source_template_id:null,sections:(row.sections??[]) as ContractTemplateVersion["sections"],createdAt:String(row.created_at) }));
}

export async function getContractStampSettings(organizationId:string):Promise<ContractStampSettings> {
  const supabase=await createSupabaseServerClient(); const result=await supabase.rpc("get_organization_contract_settings",{target_organization_id:organizationId});
  if(result.error) throw result.error; const row=(result.data?.[0]??{}) as Record<string,unknown>;
  return { enabled:row.stamp_enabled!==false,name:typeof row.stamp_name==="string"?row.stamp_name:"",
    civility:row.stamp_civility==="M."||row.stamp_civility==="Mme"?row.stamp_civility:null,
    firstName:typeof row.stamp_first_name==="string"?row.stamp_first_name:"",
    lastName:typeof row.stamp_last_name==="string"?row.stamp_last_name:"",
    company:typeof row.stamp_company==="string"?row.stamp_company:"",phone:typeof row.stamp_phone==="string"?row.stamp_phone:"",address:typeof row.stamp_short_address==="string"?row.stamp_short_address:"",position:row.stamp_position==="footer"?"footer":"signature_block" };
}

export async function getLeaseContracts(organizationId: string, leaseId: string) {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("get_lease_contracts", { target_organization_id: organizationId, target_lease_id: leaseId });
  if (result.error) throw result.error;
  return (result.data ?? []).map((row: unknown) => contractFromRow(row as Record<string, unknown>));
}

export async function getLeaseContract(organizationId: string, contractId: string) {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("get_lease_contract", { target_organization_id: organizationId, target_contract_id: contractId });
  if (result.error) throw result.error;
  const row = result.data?.[0] as Record<string, unknown> | undefined;
  return row ? attachSignatures(contractFromRow(row)) : null;
}

export async function getPortalContracts(accessId: string, leaseId?: string) {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("list_my_tenant_portal_contracts", { target_access_id: accessId, target_lease_id: leaseId ?? null });
  if (result.error) throw result.error;
  return (result.data ?? []).map((row: Record<string, unknown>) => ({
    id: row.contract_id as string, leaseId: row.lease_id as string, reference: row.reference as string,
    status: row.status as LeaseContract["status"], language: row.language === "en" ? "en" as const : "fr" as const,
    createdAt: row.created_at as string, sentAt: row.sent_at as string | null, completedAt: row.completed_at as string | null,
  }));
}

export async function getPortalContract(accessId: string, contractId: string) {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("get_my_tenant_portal_contract", { target_access_id: accessId, target_contract_id: contractId });
  if (result.error) throw result.error;
  const row = result.data?.[0] as Record<string, unknown> | undefined;
  return row ? attachSignatures(contractFromRow(row), accessId) : null;
}

export function preparedContractContent(contract: LeaseContract) {
  return renderContractSections(contract.contentSnapshot, contract.dataSnapshot);
}

export function hashContractContent(contract: LeaseContract, sections = preparedContractContent(contract)) {
  const canonical = JSON.stringify({
    template: contract.templateSnapshot, data: contract.dataSnapshot,
    content: JSON.parse(canonicalContractContent(sections)), stamp: contract.stampSnapshot,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export async function materializeContract(contract: LeaseContract, accessId: string | null) {
  const supabase = await createSupabaseServerClient();
  if (contract.finalStoragePath) return contract.finalStoragePath;
  if (contract.status !== "tenant_signed") throw new Error("contract_not_ready_for_finalization");
  const bytes = await generateContractPdf(contract);
  const storagePath = `${contract.organizationId}/${contract.id}/v1/final.pdf`;
  const upload = await supabase.storage.from("contract-documents").upload(storagePath, bytes, {
    contentType: "application/pdf", cacheControl: "31536000", upsert: false,
  });
  if (upload.error && !upload.error.message.toLowerCase().includes("exist")) throw upload.error;
  const finalHash = createHash("sha256").update(bytes).digest("hex");
  const finalized = await supabase.rpc("finalize_lease_contract", {
    target_access_id: accessId, target_contract_id: contract.id, target_storage_path: storagePath,
    target_sha256: finalHash, target_bytes: bytes.byteLength,
  });
  if (finalized.error) throw finalized.error;
  return storagePath;
}

export async function createContractSignedUrl(storagePath: string) {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.storage.from("contract-documents").createSignedUrl(storagePath, 120, { download: true });
  if (result.error) throw result.error;
  return result.data.signedUrl;
}
