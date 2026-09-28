import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveAuthorization } from "@/core/authorization/server";
import { requirePlanFeature } from "@/core/entitlements/server";
import { parseContractId } from "@/modules/contracts/model";
import { getContractTemplates, getLeaseContract, getLeaseContracts } from "@/modules/contracts/server";
import { InternalContractView } from "@/modules/contracts/views";
import { UUID_PATTERN } from "@/modules/properties/model";
import { Card, EmptyState, PageHeader } from "@/core/ui/ui";
import { getLeaseDetail } from "@/modules/tenancy/server";

export default async function ContractPage({ params, searchParams }: { params:Promise<{leaseId:string}>;searchParams:Promise<{contract?:string}> }) {
  const [{leaseId},query,authorization]=await Promise.all([params,searchParams,getActiveAuthorization()]);
  if(!authorization?.capabilities.includes("contract.manage")||!UUID_PATTERN.test(leaseId)) notFound();
  // ALIGN-01 — plan feature gating: contracts requires Essentiel+. Le Bien
  // et la Location existent bel et bien : ce n'est pas une 404, c'est une
  // offre insuffisante — on l'explique au lieu de faire disparaître la page.
  const entitlementError = await requirePlanFeature(authorization.organizationId, "contracts");
  if(entitlementError){
    return (
      <div className="page-stack">
        <PageHeader eyebrow="Contrats" title="Créer le contrat" description="Génération du contrat à partir des conditions de cette Location." />
        <Card>
          <EmptyState
            title="Fonctionnalité non incluse dans votre offre"
            description="Les contrats font partie de l'offre Essentiel et supérieures. Aucune donnée de cette Location n'est affectée : le contrat pourra être créé dès que votre offre est adaptée."
            action={<Link className="button button--primary" href="/app/billing">Voir les offres</Link>}
          />
        </Card>
      </div>
    );
  }
  const [templates,contracts,leaseDetail]=await Promise.all([getContractTemplates(authorization.organizationId),getLeaseContracts(authorization.organizationId,leaseId),getLeaseDetail(authorization.organizationId,leaseId)]);
  const contractId=parseContractId(query.contract); const selected=contractId?await getLeaseContract(authorization.organizationId,contractId):null;
  if(selected&&selected.leaseId!==leaseId) notFound();
  // AFRICA-CONTRACTS-PERFORMANCE-01 — AXE B : la clause « Modalités de
  // paiement » n'apparaît dans le contrat que si la Location en porte —
  // on le signale ici plutôt que de laisser la clause disparaître en
  // silence (mandat : jamais de disparition non expliquée).
  const leasePaymentTermsRecorded = Boolean(leaseDetail?.paymentTerms?.trim());
  return <InternalContractView leaseId={leaseId} templates={templates} contracts={contracts} selected={selected} leasePaymentTermsRecorded={leasePaymentTermsRecorded}/>;
}
