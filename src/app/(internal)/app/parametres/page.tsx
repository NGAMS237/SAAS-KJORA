import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/core/ui/ui";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";
import { OrganizationProfileForm } from "@/core/organization/organization-profile-form";
import { PinSecurityPanel } from "@/core/security/pin-controls";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotificationSoundToggle } from "@/core/notifications/notification-sound";
import Link from "next/link";
import { getActiveAuthorization } from "@/core/authorization/server";
import { requirePlanFeature } from "@/core/entitlements/server";

export default async function SettingsPage() {
  const [{ activeOrganization }, authorization] = await Promise.all([loadOrganizationContext(), getActiveAuthorization()]);
  if (!activeOrganization) redirect("/onboarding/organization");
  const hasContractRbac = Boolean(authorization?.capabilities.includes("contract.manage"));
  // ALIGN-01 — plan feature gating: contracts requires Essentiel+. Checked
  // here too (not just RBAC) so the "Configurer" card never links to a
  // destination the organization's plan can't actually open.
  const contractEntitlementError = hasContractRbac && authorization
    ? await requirePlanFeature(authorization.organizationId, "contracts")
    : null;
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
      <Card className="settings-card">
        <NotificationSoundToggle />
      </Card>
      {hasContractRbac ? <Card className="settings-card"><div className="section-heading"><div><p className="eyebrow">Contrats</p><h2>Modèles et cachet</h2><p>Configurer les modèles versionnés et le cachet visuel de cette Organization.</p></div>{contractEntitlementError ? <Link className="button button--secondary" href="/app/billing">Voir les offres</Link> : <Link className="button button--secondary" href="/app/parametres/contrats">Configurer</Link>}</div>{contractEntitlementError ? <p className="demo-hint">Les contrats font partie de l’offre Essentiel et supérieures. Votre offre actuelle ne les inclut pas encore.</p> : null}</Card> : null}
    </div>
  );
}
