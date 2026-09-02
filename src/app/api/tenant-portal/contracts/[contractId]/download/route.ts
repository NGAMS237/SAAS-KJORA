import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parseContractId } from "@/modules/contracts/model";
import { createContractSignedUrl, getPortalContract } from "@/modules/contracts/server";
import { ACTIVE_PORTAL_ACCESS_COOKIE } from "@/tenant-portal/server";

export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{contractId:string}>}) {
  const contractId=parseContractId((await params).contractId); const accessId=(await cookies()).get(ACTIVE_PORTAL_ACCESS_COOKIE)?.value;
  if(!contractId||!accessId) return NextResponse.json({error:"not_found"},{status:404});
  const contract=await getPortalContract(accessId,contractId);
  if(!contract?.finalStoragePath||contract.status!=="completed") return NextResponse.json({error:"not_found"},{status:404});
  return NextResponse.redirect(await createContractSignedUrl(contract.finalStoragePath),{headers:{"cache-control":"private, no-store"}});
}
