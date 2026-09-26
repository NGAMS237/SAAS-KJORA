import { DEFAULT_PAGE_SIZE, getPlatformCounters, listSubscriptions } from "@/modules/platform-admin/server";
import { SubscriptionsView } from "@/modules/platform-admin/views";

export const dynamic = "force-dynamic";

function parseOffset(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function single(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ? raw.trim() : undefined;
}

export default async function AdministrationSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = single(params.q);
  const plan = single(params.plan);
  const status = single(params.status);
  const currency = single(params.currency);
  const archivedRaw = single(params.archived);
  const archived = archivedRaw === "archived" || archivedRaw === "all" ? archivedRaw : "active";
  const [result, counters] = await Promise.all([
    listSubscriptions(
      DEFAULT_PAGE_SIZE,
      parseOffset(params.offset),
      { search, plan, status, currency },
      archived,
    ),
    getPlatformCounters(),
  ]);

  return (
    <SubscriptionsView
      page={result.ok ? result.data : null}
      error={result.ok ? null : result.reason}
      search={search ?? ""}
      plan={plan ?? ""}
      status={status ?? ""}
      currency={currency ?? ""}
      archived={archived}
      freeCount={counters.ok ? counters.data.subscriptionsFree : null}
      paidCount={counters.ok ? counters.data.subscriptionsPaid : null}
    />
  );
}
