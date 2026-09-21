import { DEFAULT_PAGE_SIZE, listOrganizations } from "@/modules/platform-admin/server";
import { OrganizationsView } from "@/modules/platform-admin/views";

export const dynamic = "force-dynamic";

/** `offset` est une intention de pagination, pas un droit : la RPC la borne. */
function parseOffset(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export default async function AdministrationOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const result = await listOrganizations(DEFAULT_PAGE_SIZE, parseOffset(params.offset));

  return (
    <OrganizationsView
      page={result.ok ? result.data : null}
      error={result.ok ? null : result.reason}
    />
  );
}
