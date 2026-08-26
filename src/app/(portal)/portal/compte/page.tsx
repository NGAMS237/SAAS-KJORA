import { Languages, Laptop, Mail, ShieldCheck } from "lucide-react";
import { Card, DemoNotice, ListRow, PageHeader } from "@/core/ui/ui";
import { PreferencesControls } from "@/core/preferences/preferences-controls";

export default function PortalAccountPage() {
  return (
    <div className="page-stack portal-page">
      <PageHeader
        eyebrow="Compte portail fictif"
        title="Compte"
        description="Le portail reste distinct des Memberships internes et ne propose aucun PIN au locataire."
      />
      <DemoNotice />
      <Card>
        <div className="account-section-heading">
          <p className="eyebrow">Identité et contact</p>
          <h2>Profil locataire</h2>
        </div>
        <div className="profile-summary">
          <span className="profile-avatar profile-avatar--portal" aria-hidden="true">AN</span>
          <div>
            <h2>Amina N. · Démo</h2>
            <p>Accès locataire fictif</p>
          </div>
        </div>
        <div className="list-stack">
          <ListRow icon={Mail} title="a••••@example.test" description="Canal fictif vérifié" />
        </div>
      </Card>
      <Card>
        <div className="account-section-heading">
          <p className="eyebrow">Sécurité et appareil</p>
          <h2>Accès au portail</h2>
        </div>
        <div className="list-stack">
          <ListRow icon={ShieldCheck} title="Session de démonstration" description="Aucune Auth réelle ni session persistée" />
          <ListRow icon={Laptop} title="Cet appareil" description="Aucun appareil réellement autorisé" />
        </div>
      </Card>
      <Card>
        <div className="account-section-heading">
          <p className="eyebrow">Langue et apparence</p>
          <h2>Préférences d’affichage</h2>
        </div>
        <div className="list-stack">
          <ListRow icon={Languages} title="Préférences d’affichage" description="Thème et indicateur de langue" trailing={<PreferencesControls compact />} />
        </div>
      </Card>
    </div>
  );
}
