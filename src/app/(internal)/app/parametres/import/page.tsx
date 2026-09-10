import { notFound } from "next/navigation";
import { getActiveAuthorization } from "@/core/authorization/server";
import { DataImportWizardView } from "@/modules/data-import/wizard-view";

export default async function DataImportPage() {
  const authorization = await getActiveAuthorization();
  // RBAC (§19) : accès refusé pour de bon, la ressource n'existe pas pour ce rôle.
  // Pas de restriction de plan (§29 : ne pas toucher aux quotas) — l'import
  // lui-même respecte les quotas de plan au moment de l'écriture (§18).
  if (!authorization?.capabilities.includes("data_import.manage")) notFound();
  return <DataImportWizardView />;
}
