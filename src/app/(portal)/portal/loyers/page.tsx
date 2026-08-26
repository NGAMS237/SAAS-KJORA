import { CalendarDays, ChevronRight, WalletCards } from "lucide-react";
import { Badge, Card, DemoNotice, ListRow, PageHeader } from "@/core/ui/ui";

export default function PortalRentsPage() {
  return (
    <div className="page-stack portal-page">
      <PageHeader
        eyebrow="Lecture seule"
        title="Loyers"
        description="Échéances et paiements fictifs du logement sélectionné, sans action financière."
        action={<button className="button button--secondary" type="button">Filtrer</button>}
      />
      <DemoNotice />
      <Card>
        <div className="list-stack">
          <ListRow className="list-row--contextual" icon={WalletCards} title="Août 2026" description="160 000 XAF payés sur 240 000" trailing={<span className="due-row-trailing"><Badge tone="warning">Partiel</Badge><ChevronRight aria-hidden="true" size={18} /></span>} />
          <ListRow className="list-row--contextual" icon={CalendarDays} title="Septembre 2026" description="240 000 XAF · Échéance fictive" trailing={<span className="due-row-trailing"><Badge tone="info">À venir</Badge><ChevronRight aria-hidden="true" size={18} /></span>} />
          <ListRow className="list-row--contextual" icon={CalendarDays} title="Échéance actuelle" description="240 000 XAF attendus · Démonstration" trailing={<span className="due-row-trailing"><Badge tone="due">Dû</Badge><ChevronRight aria-hidden="true" size={18} /></span>} />
          <ListRow className="list-row--contextual" icon={WalletCards} title="Juillet 2026" description="240 000 XAF · Paiement fictif confirmé" trailing={<span className="due-row-trailing"><Badge tone="success">Payé</Badge><ChevronRight aria-hidden="true" size={18} /></span>} />
          <ListRow className="list-row--contextual" icon={CalendarDays} title="Juin 2026" description="0 XAF payé sur 240 000 · Démonstration" trailing={<span className="due-row-trailing"><Badge tone="danger">En retard</Badge><ChevronRight aria-hidden="true" size={18} /></span>} />
        </div>
      </Card>
    </div>
  );
}
