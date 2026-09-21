import { DEFAULT_PAGE_SIZE, listSubscriptions } from "@/modules/platform-admin/server";
import { SubscriptionsView } from "@/modules/platform-admin/views";

export const dynamic = "force-dynamic";

function parseOffset(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export default async function AdministrationSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const result = await listSubscriptions(DEFAULT_PAGE_SIZE, parseOffset(params.offset));

  return (
    <SubscriptionsView
      page={result.ok ? result.data : null}
      error={result.ok ? null : result.reason}
    />
  );
}
