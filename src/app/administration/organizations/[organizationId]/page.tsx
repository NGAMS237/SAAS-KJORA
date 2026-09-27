import { getOrganizationDetail, getOrganizationLifecycle } from "@/modules/platform-admin/server";
import { OrganizationDetailView } from "@/modules/platform-admin/views";

export const dynamic = "force-dynamic";

export default async function AdministrationOrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const [result, lifecycleResult] = await Promise.all([
    getOrganizationDetail(organizationId),
    getOrganizationLifecycle(organizationId),
  ]);

  // REVENUE-01H — la section « Cycle de vie » n'est jamais bloquante : si elle
  // échoue seule, le reste de la fiche Organization (aperçu, interventions
  // commerciales) continue de s'afficher, comme l'extension Finances (01E).
  return (
    <OrganizationDetailView
      detail={result.ok ? result.data : null}
      error={result.ok ? null : result.reason}
      lifecycle={lifecycleResult.ok ? lifecycleResult.data : null}
    />
  );
}
