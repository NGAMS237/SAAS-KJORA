import { getSubscriptionDetail } from "@/modules/platform-admin/server";
import { SubscriptionDetailView } from "@/modules/platform-admin/views";

export const dynamic = "force-dynamic";

export default async function AdministrationSubscriptionDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const result = await getSubscriptionDetail(organizationId);

  if (!result.ok) {
    return <SubscriptionDetailView detail={null} error={result.reason} />;
  }
  if (result.data === null) {
    return <SubscriptionDetailView detail={null} error="not_found" />;
  }

  return <SubscriptionDetailView detail={result.data} error={null} />;
}
