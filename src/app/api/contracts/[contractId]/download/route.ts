import { NextResponse } from "next/server";
import { getActiveAuthorization } from "@/core/authorization/server";
import { parseContractId } from "@/modules/contracts/model";
import { createContractSignedUrl, getLeaseContract } from "@/modules/contracts/server";

export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{contractId:string}>}) {
  const [{contractId},authorization]=await Promise.all([params,getActiveAuthorization()]);
  if(!authorization?.capabilities.includes("contract.manage")||!parseContractId(contractId)) return NextResponse.json({error:"not_found"},{status:404});
  const contract=await getLeaseContract(authorization.organizationId,contractId);
  if(!contract?.finalStoragePath||contract.status!=="completed") return NextResponse.json({error:"not_found"},{status:404});
  return NextResponse.redirect(await createContractSignedUrl(contract.finalStoragePath),{headers:{"cache-control":"private, no-store"}});
}
