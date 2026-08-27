import { CalendarDays } from "lucide-react";
import { FutureState, PageHeader } from "@/core/ui/ui";

export default function PortalRentsPage() {
  return (
    <div className="page-stack portal-page">
      <PageHeader
        eyebrow="Lecture seule"
        title="Loyers"
        description="Les échéances du logement sélectionné seront affichées depuis la source financière unique."
      />
      <FutureState
        icon={CalendarDays}
        title="Échéances locatives"
        description="Aucun loyer attendu, payé, restant ou en retard n’est simulé avant la disponibilité des données réelles."
        availability="Disponible avec le Lot 6C1 puis le Portail 6E"
      />
    </div>
  );
}
