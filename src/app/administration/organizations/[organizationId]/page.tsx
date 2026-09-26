import { getOrganizationDetail } from "@/modules/platform-admin/server";
import { OrganizationDetailView } from "@/modules/platform-admin/views";

export const dynamic = "force-dynamic";

export default async function AdministrationOrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const result = await getOrganizationDetail(organizationId);

  return (
    <OrganizationDetailView
      detail={result.ok ? result.data : null}
      error={result.ok ? null : result.reason}
    />
  );
}
