import { BellRing, Building2, ReceiptText, ShieldCheck } from "lucide-react";
import { Badge, Card, DemoNotice, ListRow, PageHeader } from "@/core/ui/ui";

export default function ActivityPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Organization active uniquement"
        title="Activité"
        description="Notifications et faits utiles restent séparés de l’audit technique."
      />
      <DemoNotice />
      <Card>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Chronologie fictive</p>
            <h2>Activité récente</h2>
          </div>
          <Badge tone="info">3 nouvelles</Badge>
        </div>
        <div className="list-stack">
          <ListRow icon={ReceiptText} title="Reçu disponible" description="Paiement fictif · aujourd’hui à 09:42" trailing={<Badge tone="success">Succès</Badge>} />
          <ListRow icon={BellRing} title="Loyer bientôt dû" description="Rappel fictif · hier à 16:10" trailing={<Badge tone="info">À venir</Badge>} />
          <ListRow icon={Building2} title="Bien ajouté" description="Activité fictive · lundi à 11:05" />
          <ListRow icon={ShieldCheck} title="Accès équipe consulté" description="Trace d’interface fictive · lundi à 08:32" />
        </div>
      </Card>
    </div>
  );
}
