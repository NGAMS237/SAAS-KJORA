import {
  DEFAULT_PAGE_SIZE,
  getFinanceSummary,
  isFinancePeriodFilter,
  listFinanceRecentEvents,
  type FinancePeriodFilter,
} from "@/modules/platform-admin/server";
import { FinancesView } from "@/modules/platform-admin/views";

export const dynamic = "force-dynamic";

function parseOffset(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * FINANCE-ADMIN-01 — la période reste une liste fermée : une valeur absente
 * ou hors liste retombe silencieusement sur `last_30_days` (le défaut de la
 * page), plutôt que de transmettre une valeur non validée à la RPC — qui la
 * refuserait de toute façon (voir private.finance_period_bounds).
 */
function parsePeriod(value: string | string[] | undefined): FinancePeriodFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return isFinancePeriodFilter(raw) ? raw : "last_30_days";
}

export default async function AdministrationFinancesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const period = parsePeriod(params.period);
  const offset = parseOffset(params.offset);

  const [summaryResult, eventsResult] = await Promise.all([
    getFinanceSummary(period),
    listFinanceRecentEvents(DEFAULT_PAGE_SIZE, offset, period),
  ]);

  const error = !summaryResult.ok ? summaryResult.reason : !eventsResult.ok ? eventsResult.reason : null;

  return (
    <FinancesView
      summary={summaryResult.ok ? summaryResult.data : null}
      events={eventsResult.ok ? eventsResult.data : null}
      error={error}
      period={period}
    />
  );
}
