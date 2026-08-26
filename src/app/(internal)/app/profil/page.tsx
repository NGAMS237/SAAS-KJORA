import { Laptop, Languages, ShieldCheck } from "lucide-react";
import { Card, DemoNotice, ListRow, PageHeader } from "@/core/ui/ui";
import { PreferencesControls } from "@/core/preferences/preferences-controls";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";

export default async function ProfilePage() {
  const { user, activeOrganization } = await loadOrganizationContext();
  const initials = (user.email?.slice(0, 2) ?? "KJ").toUpperCase();
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Compte global"
        title="Profil"
        description="Identité Auth vérifiée et préférences d’interface."
      />
      <DemoNotice />
      <Card>
        <div className="profile-summary">
          <span className="profile-avatar" aria-hidden="true">{initials}</span>
          <div>
            <h2>Compte Kjora</h2>
            <p>{user.email ?? "Email non disponible"}</p>
          </div>
        </div>
        <div className="list-stack">
          <ListRow icon={ShieldCheck} title={activeOrganization?.role.replaceAll("_", " ") ?? "Aucune Organization"} description={activeOrganization?.name ?? "Créez une Organization"} />
          <ListRow icon={Laptop} title="Session authentifiée" description="Le PIN appareil n’est pas inclus dans le Lot 5B" />
          <ListRow icon={Languages} title="Préférences visuelles" description="Basculer le thème et l’indicateur FR/EN ci-dessous" trailing={<PreferencesControls compact />} />
        </div>
      </Card>
    </div>
  );
}
