import { notFound } from "next/navigation";
import { getActiveAuthorization } from "@/core/authorization/server";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";
import { PageHeader } from "@/core/ui/ui";
import { getDocumentBranding } from "@/modules/documents/branding-server";
import { DocumentBrandingForm } from "@/modules/documents/branding-form";

export default async function DocumentSettingsPage() {
  const authorization = await getActiveAuthorization();
  if (!authorization) notFound();
  const [context, branding] = await Promise.all([loadOrganizationContext(), getDocumentBranding(authorization.organizationId)]);
  return (
    <div className="page-stack">
      <PageHeader description="Ces informations apparaissent sur vos avis d’échéance, quittances, reçus et relevés." eyebrow="Paramètres" title="Mes informations bailleur" />
      <DocumentBrandingForm available={branding.available} canManage={authorization.role === "organization_owner"} initial={branding.branding} organizationName={context.activeOrganization?.name ?? ""} />
    </div>
  );
}
