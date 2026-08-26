import { CalendarDays, CircleDollarSign, ReceiptText, WalletCards } from "lucide-react";
import { Badge, Card, DemoNotice, ListRow, PageHeader } from "@/core/ui/ui";

export default function PaymentsPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Août 2026 · Période active"
        title="Paiements"
        description="Une vue mobile centrée sur les échéances, sans traitement financier réel dans ce lot."
        action={
          <button className="button button--primary" disabled type="button">
            <CircleDollarSign aria-hidden="true" size={17} />
            Enregistrer un paiement
          </button>
        }
      />
      <DemoNotice />

      <Card>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Statuts dérivés · aperçu</p>
            <h2>Échéances fictives</h2>
          </div>
          <button className="button button--secondary button--small" type="button">Filtrer</button>
        </div>
        <div className="list-stack">
          <ListRow icon={CalendarDays} title="Loyer · Appartement A2" description="Échéance fictive · 05 août" trailing={<Badge tone="danger">En retard</Badge>} />
          <ListRow icon={WalletCards} title="Loyer · Studio B1" description="160 000 XAF payés sur 240 000" trailing={<Badge tone="warning">Partiellement payé</Badge>} />
          <ListRow icon={ReceiptText} title="Loyer · Maison entière" description="Paiement fictif confirmé" trailing={<Badge tone="success">Payé</Badge>} />
          <ListRow icon={CalendarDays} title="Loyer · Appartement C3" description="Échéance fictive · 28 août" trailing={<Badge tone="info">À venir</Badge>} />
        </div>
      </Card>
    </div>
  );
}
