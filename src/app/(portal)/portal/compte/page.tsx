import { Languages, ShieldCheck } from "lucide-react";
import { Card, FutureState, ListRow, PageHeader } from "@/core/ui/ui";
import { PreferencesControls } from "@/core/preferences/preferences-controls";

export default function PortalAccountPage() {
  return (
    <div className="page-stack portal-page">
      <PageHeader
        eyebrow="Compte portail"
        title="Compte"
        description="Le futur accès locataire restera distinct des Memberships internes et ne proposera aucun PIN."
      />
      <FutureState
        className="future-state-card--signature"
        icon={ShieldCheck}
        title="Identité et accès portail"
        description="Aucune identité, session ou donnée de contact fictive n’est affichée avant l’activation du portail réel."
        availability="Disponible avec le Lot 6E — Tenant Portal minimal"
      />
      <Card className="portal-preferences-card">
        <div className="account-section-heading">
          <p className="eyebrow">Appareil</p>
          <h2>Préférences d’affichage</h2>
        </div>
        <div className="list-stack">
          <ListRow icon={Languages} title="Apparence locale" description="Thème clair ou sombre sur cet appareil" trailing={<PreferencesControls compact />} />
        </div>
      </Card>
    </div>
  );
}
