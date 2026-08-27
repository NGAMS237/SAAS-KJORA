import { ReceiptText } from "lucide-react";
import { FutureState, PageHeader } from "@/core/ui/ui";

export default function PortalReceiptsPage() {
  return (
    <div className="page-stack portal-page">
      <PageHeader
        eyebrow="Lecture seule"
        title="Reçus"
        description="Les reçus privés seront dérivés des paiements confirmés et ne disposeront d’aucun lien public permanent."
      />
      <FutureState
        icon={ReceiptText}
        title="Reçus privés"
        description="Aucun reçu n’est présenté tant que les paiements confirmés ne sont pas disponibles."
        availability="Disponible avec le Lot 6C3 puis le Portail 6E"
      />
    </div>
  );
}
