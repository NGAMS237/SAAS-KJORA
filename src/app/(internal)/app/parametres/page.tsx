import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/core/ui/ui";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";
import { OrganizationProfileForm } from "@/core/organization/organization-profile-form";
import { PinSecurityPanel } from "@/core/security/pin-controls";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const { activeOrganization } = await loadOrganizationContext();
  if (!activeOrganization) redirect("/onboarding/organization");
  const supabase = await createSupabaseServerClient();
  const financeChecks = await Promise.all(["leases", "dues", "payments", "ledger_entries"].map((table) =>
    supabase.from(table).select("id", { count: "exact", head: true }).eq("organization_id", activeOrganization.id),
  ));
  const currencyLocked = financeChecks.some(({ count }) => (count ?? 0) > 0);
  return (
    <div className="page-stack settings-v2">
      <PageHeader
        eyebrow="Espace secondaire"
        title="Paramètres"
        description="Informations minimales de l’Organization active. Le branding avancé viendra plus tard."
      />
      <Card className="settings-card settings-card--organization">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Organization</p>
              <h2>{activeOrganization.name}</h2>
            </div>
          </div>
          <OrganizationProfileForm organization={activeOrganization} currencyLocked={currencyLocked} />
      </Card>
      <Card className="settings-card">
        <PinSecurityPanel />
      </Card>
    </div>
  );
}
