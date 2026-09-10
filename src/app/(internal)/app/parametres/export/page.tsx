import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveAuthorization } from "@/core/authorization/server";
import { getOrganizationEntitlements } from "@/core/entitlements/server";
import { listExportHistory } from "@/modules/data-export/server";
import { DataExportView } from "@/modules/data-export/views";
import { Card, EmptyState, PageHeader } from "@/core/ui/ui";

export default async function DataExportPage() {
  const authorization = await getActiveAuthorization();
  // RBAC : accès refusé pour de bon, la ressource n'existe pas pour ce rôle
  // (même politique que /app/parametres/import et /app/parametres/contrats).
  if (!authorization?.capabilities.includes("data_export.manage")) notFound();

  const entitlements = await getOrganizationEntitlements(authorization.organizationId);
  const canUseStandardExports = Boolean(entitlements?.features.has("exports_standard"));
  const canUseAdvancedExports = Boolean(entitlements?.features.has("exports_advanced"));

  if (!canUseStandardExports) {
    return (
      <div className="page-stack">
        <PageHeader eyebrow="Mes données" title="Exporter mes données" description="Récupérez vos données KJORA (biens, locations, échéances, paiements…) sans jamais les modifier." />
        <Card>
          <EmptyState
            title="Fonctionnalité non incluse dans votre offre"
            description="L'export de données fait partie de l'offre Essentiel et supérieures. Aucune donnée n'est perdue : cette page reste disponible dès que votre offre est adaptée."
            action={<Link className="button button--primary" href="/app/billing">Voir les offres</Link>}
          />
        </Card>
      </div>
    );
  }

  const history = await listExportHistory(authorization.organizationId);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Mes données"
        title="Exporter mes données"
        description="Export en lecture seule de vos données KJORA — biens, logements, locataires, locations, échéances, paiements, crédits, dépôts, documents et contrats. Rien n'est jamais modifié ni supprimé."
      />
      <DataExportView canUseAdvancedExports={canUseAdvancedExports} currentPlan={entitlements?.plan ?? "decouverte"} initialHistory={history} />
    </div>
  );
}
