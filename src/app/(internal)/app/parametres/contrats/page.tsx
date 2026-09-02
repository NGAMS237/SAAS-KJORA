import { notFound } from "next/navigation";
import { getActiveAuthorization } from "@/core/authorization/server";
import { getContractStampSettings, getContractTemplateHistory } from "@/modules/contracts/server";
import { ContractSettingsView } from "@/modules/contracts/settings-view";

export default async function ContractSettingsPage(){const authorization=await getActiveAuthorization();if(!authorization?.capabilities.includes("contract.manage"))notFound();const [templates,settings]=await Promise.all([getContractTemplateHistory(authorization.organizationId),getContractStampSettings(authorization.organizationId)]);return <ContractSettingsView templates={templates} initialSettings={settings}/>;}
