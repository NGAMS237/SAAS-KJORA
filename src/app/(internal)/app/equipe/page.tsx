import { Crown, MailPlus, UserRound } from "lucide-react";
import { Badge, Card, ListRow, PageHeader } from "@/core/ui/ui";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";

export default async function TeamPage() {
  const { user, activeOrganization } = await loadOrganizationContext();
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Espace secondaire"
        title="Équipe"
        description="Placeholder de l’administration des six rôles internes fixes. Aucun accès réel n’est créé."
        action={
          <button className="button button--primary" disabled type="button">
            <MailPlus aria-hidden="true" size={17} />
            Inviter un membre
          </button>
        }
      />
      <Card>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Membership actif</p>
            <h2>Membres</h2>
          </div>
          <Badge tone="success">Lot 5B</Badge>
        </div>
        <div className="list-stack">
          <ListRow icon={Crown} title={user.email ?? "Compte vérifié"} description={activeOrganization?.name ?? "Organization active"} trailing={<Badge>Organization Owner</Badge>} />
          <ListRow icon={UserRound} title="Les autres rôles apparaîtront ici" description="Gestionnaire, encaisseur, gardien, comptable et consultation" />
        </div>
      </Card>
    </div>
  );
}
