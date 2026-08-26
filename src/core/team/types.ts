import type { InternalRole } from "@/core/authorization/capabilities";

export type TeamMember = {
  membershipId: string;
  userId: string;
  email: string;
  role: InternalRole;
  status: "active" | "revoked";
  createdAt: string;
};

export type TeamInvitation = {
  invitationId: string;
  email: string;
  role: InternalRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  createdAt: string;
  expiresAt: string;
};

export type AdministrativeAuditEntry = {
  auditId: string;
  action: string;
  actorEmail: string | null;
  targetEmail: string | null;
  createdAt: string;
};

export type TeamData = {
  members: TeamMember[];
  invitations: TeamInvitation[];
  audit: AdministrativeAuditEntry[];
};
