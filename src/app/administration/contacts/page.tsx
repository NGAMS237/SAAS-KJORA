import { DEFAULT_PAGE_SIZE, listCommercialContacts } from "@/modules/platform-admin/server";
import { ContactsView } from "@/modules/platform-admin/views";

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

export default async function AdministrationContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = single(params.q);
  const result = await listCommercialContacts(DEFAULT_PAGE_SIZE, parseOffset(params.offset), { search });

  return (
    <ContactsView
      page={result.ok ? result.data : null}
      error={result.ok ? null : result.reason}
      search={search ?? ""}
    />
  );
}
