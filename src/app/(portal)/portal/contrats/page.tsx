import { notFound } from "next/navigation";
import { parseContractId } from "@/modules/contracts/model";
import { getPortalContract, getPortalContracts } from "@/modules/contracts/server";
import { PortalContractsView } from "@/modules/contracts/views";
import { loadPortalContext } from "@/tenant-portal/server";

export default async function PortalContractsPage({searchParams}:{searchParams:Promise<{contract?:string;lease?:string}>}) {
  const [context,query]=await Promise.all([loadPortalContext(),searchParams]); if(!context?.activeAccess) notFound();
  const contracts=await getPortalContracts(context.activeAccess.accessId,query.lease); const contractId=parseContractId(query.contract);
  const selected=contractId?await getPortalContract(context.activeAccess.accessId,contractId):null;
  return <PortalContractsView contracts={contracts} selected={selected} language={context.activeAccess.preferredLanguage}/>;
}
