import { redirect } from "next/navigation";
import { requireUser } from "@/core/auth/require-user";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";
import { resolveMyRestrictedOrganization } from "@/core/organization/restricted-organizations";
import { SuspendedOrganizationView } from "@/core/organization/suspended-organization-view";
import { getBillingOverview, listBillingInvoices } from "@/core/billing/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// =============================================================================
// REVENUE-LAUNCH-01 v3 — Contexte limité d'une Organization suspendue/archivée
// =============================================================================
// Jamais une application vide, jamais l'onboarding d'une nouvelle
// Organization : l'utilisateur voit l'état de son Organization et les seuls
// accès autorisés (support ; facturation et export du propriétaire pour une
// suspension). Chaque droit est recalculé en base à chaque requête
// (list_my_restricted_organizations, get_billing_overview/list_billing_invoices
// sous private.can_read_billing) — le paramètre `organization` n'est qu'un
// choix d'affichage, jamais une autorisation.
// =============================================================================

export const dynamic = "force-dynamic";

export default async function SuspendedOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ organization?: string | string[] }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const requested = Array.isArray(params.organization) ? params.organization[0] : params.organization;

  const [{ organizations, selected }, context] = await Promise.all([
    resolveMyRestrictedOrganization(requested ?? null),
    loadOrganizationContext(),
  ]);
  if (!selected) redirect("/app");

  const supabase = await createSupabaseServerClient();
  const portal = await supabase.rpc("has_tenant_portal_identity");
  const hasPortalIdentity = !portal.error && portal.data === true;

  const billingAllowed = selected.status === "suspended" && selected.canViewBilling;
  const [overview, invoices] = billingAllowed
    ? await Promise.all([getBillingOverview(selected.id), listBillingInvoices(selected.id)])
    : [null, []];

  return (
    <SuspendedOrganizationView
      organizations={organizations}
      selected={selected}
      contactEmail={user.email}
      overview={overview}
      invoices={invoices}
      hasActiveOrganizations={context.organizations.length > 0}
      hasPortalIdentity={hasPortalIdentity}
    />
  );
}
