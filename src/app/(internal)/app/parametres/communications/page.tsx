import { notFound } from "next/navigation";
import { getActiveAuthorization, isOrganizationActive } from "@/core/authorization/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isProductionDeployment, resolveTransactionalEmailStatus } from "@/modules/communications/config";
import { parseCommunicationSettings } from "@/modules/communications/settings-model";
import { CommunicationSettingsView } from "@/modules/communications/settings-view";

// NCE-01 — Réglages de communication : propriétaire seul, Organization
// active. Les autres rôles n'ont pas cette page (même politique que
// /app/parametres/export).
export default async function CommunicationSettingsPage() {
  const authorization = await getActiveAuthorization();
  if (!authorization || authorization.role !== "organization_owner") notFound();
  if (!(await isOrganizationActive(authorization.organizationId))) notFound();
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("get_organization_communication_settings", {
    target_organization_id: authorization.organizationId,
  });
  const settings = result.error ? null : parseCommunicationSettings(result.data);
  if (!settings) notFound();
  const status = resolveTransactionalEmailStatus(process.env);
  return <CommunicationSettingsView
    emailOperational={status.operational}
    senderAddress={status.senderAddress}
    settings={settings}
    testAvailable={!isProductionDeployment(process.env)}
  />;
}
