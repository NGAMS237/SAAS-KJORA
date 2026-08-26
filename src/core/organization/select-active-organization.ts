export const ACTIVE_ORGANIZATION_COOKIE = "kjora-active-organization";

export type OrganizationOption = {
  id: string;
  name: string;
  role: string;
  countryCode: string;
  currencyCode: string;
  language: "fr" | "en";
  timezone: string;
};

export function selectActiveOrganization(
  organizations: readonly OrganizationOption[],
  requestedId: string | null | undefined,
) {
  if (requestedId) {
    const requested = organizations.find((organization) => organization.id === requestedId);
    if (requested) return requested;
  }
  return organizations[0] ?? null;
}
