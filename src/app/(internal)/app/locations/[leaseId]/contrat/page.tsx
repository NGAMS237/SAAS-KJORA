import { notFound } from "next/navigation";
import { getActiveAuthorization } from "@/core/authorization/server";
import { parseContractId } from "@/modules/contracts/model";
import { getContractTemplates, getLeaseContract, getLeaseContracts } from "@/modules/contracts/server";
import { InternalContractView } from "@/modules/contracts/views";
import { UUID_PATTERN } from "@/modules/properties/model";

export default async function ContractPage({ params, searchParams }: { params:Promise<{leaseId:string}>;searchParams:Promise<{contract?:string}> }) {
  const [{leaseId},query,authorization]=await Promise.all([params,searchParams,getActiveAuthorization()]);
  if(!authorization?.capabilities.includes("contract.manage")||!UUID_PATTERN.test(leaseId)) notFound();
  const [templates,contracts]=await Promise.all([getContractTemplates(authorization.organizationId),getLeaseContracts(authorization.organizationId,leaseId)]);
  const contractId=parseContractId(query.contract); const selected=contractId?await getLeaseContract(authorization.organizationId,contractId):null;
  if(selected&&selected.leaseId!==leaseId) notFound();
  return <InternalContractView leaseId={leaseId} templates={templates} contracts={contracts} selected={selected}/>;
}
