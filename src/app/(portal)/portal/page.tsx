import { CalendarClock, CircleCheck, House, WalletCards } from "lucide-react";
import { Badge, Card, DemoNotice, KpiCard, ListRow, PageHeader } from "@/core/ui/ui";
import { demoPortalContext } from "@/core/demo/demo-context";

export default function PortalHomePage() {
  return (
    <div className="page-stack portal-page">
      <PageHeader
        eyebrow="Espace locataire · Lecture seule"
        title={`Bonjour ${demoPortalContext.tenantName}`}
        description="Retrouvez une synthèse fictive de votre logement et de vos loyers autorisés."
      />
      <DemoNotice />
      <Card className="portal-balance-card">
        <div>
          <p className="eyebrow">Solde actuel</p>
          <p className="portal-balance-card__amount"><strong className="financial-value">80 000 XAF</strong> restant à payer</p>
          <p className="portal-balance-card__deadline">À régler avant le 5 septembre</p>
        </div>
        <Badge tone="warning">Partiellement payé</Badge>
      </Card>
      <Card className="portal-home-card">
        <div className="portal-home-card__icon" aria-hidden="true"><House size={24} /></div>
        <div>
          <p className="eyebrow">Logement actif</p>
          <h2>{demoPortalContext.home}</h2>
          <p>Bail fictif · mensuel · accès portail de démonstration</p>
        </div>
        <Badge tone="success">Actif</Badge>
      </Card>
      <section className="kpi-grid kpi-grid--portal" aria-label="Situation locative fictive">
        <KpiCard label="Attendu" value="240 000 XAF" note="Échéance fictive" />
        <KpiCard label="Payé" value="160 000 XAF" note="Montant confirmé fictif" tone="positive" />
        <KpiCard label="Restant" value="80 000 XAF" note="Lecture seule" tone="warning" />
      </section>
      <Card>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Prochaine étape</p>
            <h2>Votre situation</h2>
          </div>
          <Badge tone="warning">Partiel</Badge>
        </div>
        <div className="list-stack">
          <ListRow icon={CalendarClock} title="Prochaine échéance" description="05 septembre 2026 · Donnée fictive" />
          <ListRow icon={WalletCards} title="Dernier paiement" description="160 000 XAF · Démonstration" />
          <ListRow icon={CircleCheck} title="Reçu disponible" description="Consultation et téléchargement fictifs" />
        </div>
      </Card>
    </div>
  );
}
