import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/core/ui/ui";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";
import { OrganizationProfileForm } from "@/core/organization/organization-profile-form";
import { PinSecurityPanel } from "@/core/security/pin-controls";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotificationSoundToggle } from "@/core/notifications/notification-sound";
import Link from "next/link";
import { getActiveAuthorization } from "@/core/authorization/server";
import { getOrganizationEntitlements } from "@/core/entitlements/server";
import { FeatureEntryCard } from "@/core/entitlements/feature-entry-card";

export default async function SettingsPage() {
  const [{ activeOrganization }, authorization] = await Promise.all([loadOrganizationContext(), getActiveAuthorization()]);
  if (!activeOrganization) redirect("/onboarding/organization");
  const hasContractRbac = Boolean(authorization?.capabilities.includes("contract.manage"));
  const hasDataImportRbac = Boolean(authorization?.capabilities.includes("data_import.manage"));
  const hasDataExportRbac = Boolean(authorization?.capabilities.includes("data_export.manage"));
  // ALIGN-01 — plan feature gating: contracts et exports requièrent
  // respectivement Essentiel+. Vérifié ici aussi (pas seulement le RBAC) afin
  // que la carte affiche le bon état sans jamais mener à une destination que
  // l'offre de l'Organization ne permet pas d'ouvrir (FEATURE GATING UX §14).
  //
  // AFRICA-CONTRACTS-PERFORMANCE-01 — AXE A/C : le verrou de devise passe par
  // UN seul appel à get_organization_currency_lock (liste exhaustive des 6
  // relations financières, private.organization_has_financial_operations),
  // au lieu de 4 comptages séparés (leases/dues/payments/ledger_entries,
  // oubliant payment_allocations et lease_financial_terms) exécutés à chaque
  // affichage de cette page.
  const supabase = await createSupabaseServerClient();
  const [entitlements, currencyLock] = await Promise.all([
    authorization ? getOrganizationEntitlements(authorization.organizationId) : Promise.resolve(null),
    supabase.rpc("get_organization_currency_lock", { target_organization_id: activeOrganization.id }).maybeSingle(),
  ]);
  const currentPlan = entitlements?.plan ?? "decouverte";
  const hasContractsFeature = Boolean(entitlements?.features.has("contracts"));
  const hasExportsFeature = Boolean(entitlements?.features.has("exports_standard"));
  const currencyLocked = (currencyLock.data as { is_locked: boolean } | null)?.is_locked ?? true;
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
      <Card className="settings-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Documents</p>
            <h2>Mes informations bailleur</h2>
            <p>Nom, adresse, téléphone, logo, signature et moyens de paiement imprimés sur vos avis, quittances et reçus.</p>
          </div>
          <Link className="button button--secondary" href="/app/parametres/documents">Configurer</Link>
        </div>
      </Card>
      {authorization?.role === "organization_owner" ? (
        <Card className="settings-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Communications</p>
              <h2>Courriels automatiques</h2>
              <p>Avis d’échéance, rappels, reçus, quittances et copie propriétaire — courriels transactionnels uniquement.</p>
            </div>
            <Link className="button button--secondary" href="/app/parametres/communications">Configurer</Link>
          </div>
        </Card>
      ) : null}
      {hasContractRbac ? (
        <FeatureEntryCard
          ctaLabel="Configurer"
          currentPlan={currentPlan}
          description="Configurer les modèles versionnés et le cachet visuel de cette Organization."
          entitled={hasContractsFeature}
          eyebrow="Contrats"
          feature="contracts"
          href="/app/parametres/contrats"
          minimumPlan="essentiel"
          modalMessage="Votre offre Découverte ne comprend pas encore la création et la signature de contrats. Cette fonctionnalité est disponible à partir de l’offre Essentiel."
          modalTitle="Les contrats ne sont pas inclus dans votre offre"
          title="Modèles et cachet"
        />
      ) : null}
      {hasDataExportRbac ? (
        <FeatureEntryCard
          ctaLabel="Exporter"
          currentPlan={currentPlan}
          description="Exporter vos biens, locations, échéances, paiements et documents — en lecture seule."
          entitled={hasExportsFeature}
          eyebrow="Mes données"
          feature="exports_standard"
          href="/app/parametres/export"
          minimumPlan="essentiel"
          modalMessage="L’export de vos données (CSV, Excel) fait partie de l’offre Essentiel et supérieures."
          modalTitle="L’export n’est pas inclus dans votre offre"
          title="Exporter mes données"
        />
      ) : null}
      {hasDataImportRbac ? <Card className="settings-card"><div className="section-heading"><div><p className="eyebrow">Migration de données</p><h2>Importer mes données</h2><p>Reprendre vos biens, logements, locataires et baux depuis Rentila, un CSV ou un fichier Excel.</p></div><Link className="button button--secondary" href="/app/parametres/import">Importer</Link></div></Card> : null}
    </div>
  );
}
