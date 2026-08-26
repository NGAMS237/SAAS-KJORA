import { ShieldX } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/core/ui/ui";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";
import { loadTeamData } from "@/core/team/load-team-data";
import { TeamManagement } from "@/core/team/team-management";

export default async function TeamPage() {
  const { user, activeOrganization } = await loadOrganizationContext();
  if (!activeOrganization?.capabilities.includes("member.view")) {
    return <div className="page-stack"><PageHeader eyebrow="RBAC" title="Accès refusé" description="La gestion de l’équipe est réservée à Organization Owner."/><Card><EmptyState icon={ShieldX} title="Permission insuffisante" description="Un accès direct ne contourne pas les contrôles serveur et base."/></Card></div>;
  }
  const data = await loadTeamData(activeOrganization.id);
  return <TeamManagement currentUserId={user.id} initialData={data} organizationName={activeOrganization.name}/>;
}
