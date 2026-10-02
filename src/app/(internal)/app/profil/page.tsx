import { Laptop, Languages, ShieldCheck } from "lucide-react";
import { Card, ListRow, PageHeader } from "@/core/ui/ui";
import { PreferencesControls } from "@/core/preferences/preferences-controls";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PersonalWhatsAppPreferencesForm, type PersonalWhatsAppPreferences } from "@/modules/communications/personal-whatsapp-preferences";

export default async function ProfilePage() {
  const { user, activeOrganization } = await loadOrganizationContext();
  const supabase = await createSupabaseServerClient();
  const { data: communicationPreferences } = await supabase.rpc("get_my_whatsapp_preferences");
  const initials = (user.email?.slice(0, 2) ?? "KJ").toUpperCase();
  return (
    <div className="page-stack profile-v2">
      <PageHeader
        eyebrow="Compte global"
        title="Profil"
        description="Identité Auth vérifiée et préférences d’interface."
      />
      <Card className="profile-card">
        <div className="profile-summary">
          <span className="profile-avatar" aria-hidden="true">{initials}</span>
          <div>
            <h2>Compte Kjora</h2>
            <p>{user.email ?? "Email non disponible"}</p>
          </div>
        </div>
        <div className="list-stack">
          <ListRow icon={ShieldCheck} title={activeOrganization?.role.replaceAll("_", " ") ?? "Aucune Organization"} description={activeOrganization?.name ?? "Créez une Organization"} />
          <ListRow icon={Laptop} title="Session authentifiée" description="Le PIN local facultatif peut être géré depuis Paramètres" />
          <ListRow icon={Languages} title="Préférences visuelles" description="Basculer le thème et l’indicateur FR/EN ci-dessous" trailing={<PreferencesControls compact />} />
        </div>
      </Card>
      <Card className="profile-card"><h2>WhatsApp / communications</h2><PersonalWhatsAppPreferencesForm initial={(communicationPreferences??{}) as PersonalWhatsAppPreferences}/></Card>
    </div>
  );
}
