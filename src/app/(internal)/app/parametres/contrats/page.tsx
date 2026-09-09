import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveAuthorization } from "@/core/authorization/server";
import { requirePlanFeature } from "@/core/entitlements/server";
import { getContractStampSettings, getContractTemplateHistory } from "@/modules/contracts/server";
import { ContractSettingsView } from "@/modules/contracts/settings-view";
import { Card, EmptyState, PageHeader } from "@/core/ui/ui";

export default async function ContractSettingsPage(){
  const authorization=await getActiveAuthorization();
  // RBAC : accès refusé pour de bon, la ressource n'existe pas pour ce rôle.
  if(!authorization?.capabilities.includes("contract.manage"))notFound();
  // ALIGN-01 — plan feature gating: contracts requires Essentiel+. Ce n'est
  // pas une absence de ressource (404) mais une offre insuffisante : on
  // l'explique et on oriente vers la mise à niveau, on ne masque jamais
  // la fonctionnalité derrière une page introuvable.
  const entitlementError=await requirePlanFeature(authorization.organizationId,"contracts");
  if(entitlementError){
    return (
      <div className="page-stack">
        <PageHeader eyebrow="Contrats" title="Modèles et cachet" description="Configuration des modèles de contrat versionnés et du cachet visuel de cette Organization." />
        <Card>
          <EmptyState
            title="Fonctionnalité non incluse dans votre offre"
            description="Les contrats (modèles versionnés, cachet, signature) font partie de l'offre Essentiel et supérieures. Aucune donnée n'est perdue : cette page reste disponible dès que votre offre est adaptée."
            action={<Link className="button button--primary" href="/app/billing">Voir les offres</Link>}
          />
        </Card>
      </div>
    );
  }
  const [templates,settings]=await Promise.all([getContractTemplateHistory(authorization.organizationId),getContractStampSettings(authorization.organizationId)]);
  return <ContractSettingsView templates={templates} initialSettings={settings}/>;
}
