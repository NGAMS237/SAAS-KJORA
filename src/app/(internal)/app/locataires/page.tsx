import { UserRoundPlus, Users } from "lucide-react";
import { Card, DemoNotice, EmptyState, PageHeader } from "@/core/ui/ui";

export default function TenantsPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Relations locatives"
        title="Locataires"
        description="Un espace dédié aux dossiers locataires, à leurs baux et à l’accès portail."
        action={
          <button className="button button--primary" disabled type="button">
            <UserRoundPlus aria-hidden="true" size={17} />
            Ajouter un locataire
          </button>
        }
      />
      <DemoNotice />
      <Card>
        <EmptyState
          icon={Users}
          title="Aucun locataire pour le moment"
          description="Cette page est un placeholder navigable. Aucun dossier personnel réel n’est stocké dans le Lot 5A."
        />
      </Card>
    </div>
  );
}
