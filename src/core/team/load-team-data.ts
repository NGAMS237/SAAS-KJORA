import "server-only";

import { isInternalRole } from "@/core/authorization/capabilities";
import type { AdministrativeAuditEntry, TeamData, TeamInvitation, TeamMember } from "@/core/team/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MemberRow = {
  membership_id: string; user_id: string; email: string; role: string; status: "active" | "revoked"; created_at: string;
};
type InvitationRow = {
  invitation_id: string; email: string; role: string; status: TeamInvitation["status"]; created_at: string; expires_at: string;
};
type AuditRow = {
  audit_id: string; action: string; actor_email: string | null; target_email: string | null; created_at: string;
};

export async function loadTeamData(organizationId: string): Promise<TeamData> {
  const supabase = await createSupabaseServerClient();
  const [membersResult, invitationsResult, auditResult] = await Promise.all([
    supabase.rpc("list_organization_members", { target_organization_id: organizationId }),
    supabase.rpc("list_organization_invitations", { target_organization_id: organizationId }),
    supabase.rpc("list_administrative_audit", { target_organization_id: organizationId, result_limit: 25 }),
  ]);
  if (membersResult.error) throw membersResult.error;
  if (invitationsResult.error) throw invitationsResult.error;
  if (auditResult.error) throw auditResult.error;

  const members: TeamMember[] = ((membersResult.data ?? []) as MemberRow[]).flatMap((row) => {
    if (!isInternalRole(row.role)) return [];
    return [{
      membershipId: row.membership_id,
      userId: row.user_id,
      email: row.email,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
    }];
  });
  const invitations: TeamInvitation[] = ((invitationsResult.data ?? []) as InvitationRow[]).flatMap((row) => {
    if (!isInternalRole(row.role)) return [];
    return [{
      invitationId: row.invitation_id,
      email: row.email,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }];
  });
  const audit: AdministrativeAuditEntry[] = ((auditResult.data ?? []) as AuditRow[]).map((row) => ({
    auditId: row.audit_id,
    action: row.action,
    actorEmail: row.actor_email,
    targetEmail: row.target_email,
    createdAt: row.created_at,
  }));
  return { members, invitations, audit };
}
