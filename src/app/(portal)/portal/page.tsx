import { House } from "lucide-react";
import { FutureState, PageHeader } from "@/core/ui/ui";

export default function PortalHomePage() {
  return (
    <div className="page-stack portal-page">
      <PageHeader
        eyebrow="Espace locataire · Lecture seule"
        title="Portail locataire"
        description="Cet espace utilisera les mêmes vérités métier que l’interface interne, sans copie ni montant simulé."
      />
      <FutureState
        className="future-state-card--signature"
        icon={House}
        title="Votre logement et votre situation"
        description="Le résumé du bail, les échéances, les paiements et les reçus apparaîtront uniquement lorsque le portail réel sera activé."
        availability="Disponible avec le Lot 6E — Tenant Portal minimal"
      />
    </div>
  );
}
