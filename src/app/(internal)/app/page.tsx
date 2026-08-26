import { ArrowUpRight, Building2, Clock3, ReceiptText, WalletCards } from "lucide-react";
import { ActionLink, Badge, Card, DemoNotice, KpiCard, ListRow, PageHeader } from "@/core/ui/ui";
import { requireUser } from "@/core/auth/require-user";
import { PinSetupPrompt } from "@/core/security/pin-controls";

export default async function DashboardPage() {
  const user = await requireUser();
  const userLabel = user.email?.split("@")[0] ?? "propriétaire";
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Mois courant · Août 2026"
        title={`Bonjour ${userLabel}`}
        description="Une lecture calme de votre activité locative, dans l’Organization active uniquement."
        action={<ActionLink href="/app/paiements">Voir les paiements</ActionLink>}
      />
      <DemoNotice />
      <PinSetupPrompt />

      <section className="kpi-grid" aria-label="Indicateurs de démonstration">
        <KpiCard label="Attendu" value="1 240 000 XAF" note="8 échéances fictives" />
        <KpiCard label="Encaissé" value="920 000 XAF" note="Paiements confirmés fictifs" tone="positive" />
        <KpiCard label="Restant" value="320 000 XAF" note="À suivre ce mois-ci" />
        <KpiCard label="En retard" value="2 loyers" note="Données de démonstration" tone="warning" />
      </section>

      <div className="content-grid">
        <Card>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Priorités</p>
              <h2>À surveiller</h2>
            </div>
            <Badge tone="warning">2 éléments</Badge>
          </div>
          <div className="list-stack">
            <ListRow
              icon={Clock3}
              title="Échéance en retard"
              description="Résidence Nlongkak · Démonstration"
              trailing={<Badge tone="danger">En retard</Badge>}
            />
            <ListRow
              icon={WalletCards}
              title="Paiement partiel"
              description="Reste fictif : 80 000 XAF"
              trailing={<Badge tone="warning">Partiel</Badge>}
            />
          </div>
        </Card>

        <Card>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Aujourd’hui</p>
              <h2>Activité récente</h2>
            </div>
            <ArrowUpRight aria-hidden="true" className="section-heading__icon" size={20} />
          </div>
          <div className="list-stack">
            <ListRow icon={ReceiptText} title="Reçu généré" description="Il y a 18 minutes · Démonstration" />
            <ListRow icon={Building2} title="Bien consulté" description="Il y a 1 heure · Démonstration" />
          </div>
        </Card>
      </div>
    </div>
  );
}
