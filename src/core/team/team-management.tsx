"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Crown, MailPlus, RefreshCw, ShieldCheck, UserMinus, Users } from "lucide-react";
import { INTERNAL_ROLES, ROLE_LABELS, type InternalRole } from "@/core/authorization/capabilities";
import { usePreferences } from "@/core/preferences/preferences-provider";
import type { TeamData } from "@/core/team/types";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/ui";

type TeamAction = Record<string, unknown> & { action: string };
const ASSIGNABLE_ROLES = INTERNAL_ROLES.filter((value) => value !== "organization_owner");

export function TeamManagement({ currentUserId, initialData, organizationName }: { currentUserId: string; initialData: TeamData; organizationName: string }) {
  const router = useRouter();
  const { language } = usePreferences();
  const english = language === "EN";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InternalRole>("manager");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(payload: TeamAction, busy: string) {
    setBusyKey(busy); setMessage(null);
    const response = await fetch("/api/team", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setMessage(result.error === "email_configuration_required"
        ? (english ? "Transactional invitation email is not configured on this environment." : "L’email transactionnel d’invitation n’est pas configuré sur cet environnement.")
        : (english ? "The action was refused. Check the role, invitation or Owner protection." : "L’action a été refusée. Vérifiez le rôle, l’invitation ou la protection Owner."));
      setBusyKey(null); return false;
    }
    setBusyKey(null); router.refresh(); return true;
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (await run({ action: "invite", email, role }, "invite")) {
      setEmail("");
      setMessage(english ? "Invitation sent. No access exists before acceptance." : "Invitation envoyée. Aucun accès n’existe avant acceptation.");
    }
  }

  return <div className="page-stack">
    <PageHeader eyebrow={english ? "Internal Organization Membership" : "Membership interne"} title={english ? "Team" : "Équipe"} description={english ? `Members and invitations for ${organizationName}.` : `Membres et invitations de ${organizationName}.`} />
    {message ? <p className="form-feedback" role="status">{message}</p> : null}
    <Card><div className="section-heading"><div><p className="eyebrow">{english ? "Invite" : "Invitation"}</p><h2>{english ? "Invite a member" : "Inviter un membre"}</h2></div><MailPlus aria-hidden="true" size={22}/></div>
      <form className="team-invite-form" onSubmit={invite}><label className="field"><span>Email</span><input autoComplete="email" inputMode="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="membre@exemple.com" /></label><label className="field"><span>{english ? "Role" : "Rôle"}</span><select value={role} onChange={(event) => setRole(event.target.value as InternalRole)}>{ASSIGNABLE_ROLES.map((value) => <option value={value} key={value}>{ROLE_LABELS[value][english ? "en" : "fr"]}</option>)}</select></label><button className="button button--primary" disabled={busyKey !== null} type="submit"><MailPlus aria-hidden="true" size={17}/>{busyKey === "invite" ? (english ? "Sending…" : "Envoi…") : (english ? "Send invitation" : "Envoyer l’invitation")}</button></form>
      <p className="demo-hint">{english ? "The invitation expires after 7 days. A role grants no permission before acceptance." : "L’invitation expire après 7 jours. Le rôle n’accorde aucune permission avant acceptation."}</p>
    </Card>
    <Card><div className="section-heading"><div><p className="eyebrow">RBAC</p><h2>{english ? "Active members" : "Membres actifs"}</h2></div><Badge tone="success">{initialData.members.filter((member) => member.status === "active").length}</Badge></div><div className="team-list">{initialData.members.map((member) => <MemberRow busyKey={busyKey} currentUserId={currentUserId} english={english} key={member.membershipId} member={member} run={run}/>)}</div></Card>
    <Card><div className="section-heading"><div><p className="eyebrow">7 {english ? "days" : "jours"}</p><h2>{english ? "Invitations" : "Invitations en attente"}</h2></div><RefreshCw aria-hidden="true" size={21}/></div>
      {initialData.invitations.length ? <div className="team-list">{initialData.invitations.map((invitation) => <div className="team-row" key={invitation.invitationId}><div className="team-row__identity"><strong>{invitation.email}</strong><span>{ROLE_LABELS[invitation.role][english ? "en" : "fr"]} · {new Date(invitation.expiresAt).toLocaleDateString(english ? "en-GB" : "fr-FR")}</span></div><Badge tone={invitation.status === "pending" ? "warning" : invitation.status === "accepted" ? "success" : "neutral"}>{invitationStatus(invitation.status, english)}</Badge>{invitation.status === "pending" || invitation.status === "expired" ? <div className="team-row__actions"><button className="button button--secondary button--small" disabled={busyKey !== null} onClick={() => run({ action: "resend_invitation", invitationId: invitation.invitationId, role: invitation.role }, `resend-${invitation.invitationId}`)} type="button">{english ? "Resend" : "Relancer"}</button>{invitation.status === "pending" ? <button className="button button--ghost button--small" disabled={busyKey !== null} onClick={() => run({ action: "revoke_invitation", invitationId: invitation.invitationId }, `revoke-invite-${invitation.invitationId}`)} type="button">{english ? "Cancel" : "Annuler"}</button> : null}</div> : null}</div>)}</div> : <EmptyState icon={MailPlus} title={english ? "No invitation" : "Aucune invitation"} description={english ? "Pending invitations will appear here." : "Les invitations en attente apparaîtront ici."}/>}
    </Card>
    <Card><div className="section-heading"><div><p className="eyebrow">Audit</p><h2>{english ? "Administrative activity" : "Activité administrative"}</h2></div><ShieldCheck aria-hidden="true" size={21}/></div>{initialData.audit.length ? <div className="team-audit-list">{initialData.audit.map((entry) => <div key={entry.auditId}><strong>{auditLabel(entry.action, english)}</strong><span>{entry.actorEmail ?? "—"}{entry.targetEmail ? ` → ${entry.targetEmail}` : ""} · {new Date(entry.createdAt).toLocaleString(english ? "en-GB" : "fr-FR")}</span></div>)}</div> : <EmptyState icon={ShieldCheck} title={english ? "No sensitive action" : "Aucune action sensible"} description={english ? "Invitations, role changes and revocations are audited." : "Les invitations, changements de rôle et révocations sont audités."}/>} </Card>
  </div>;
}

function MemberRow({ busyKey, currentUserId, english, member, run }: { busyKey: string | null; currentUserId: string; english: boolean; member: TeamData["members"][number]; run: (payload: TeamAction, busy: string) => Promise<boolean> }) {
  const [role, setRole] = useState(member.role); const self = member.userId === currentUserId; const active = member.status === "active";
  return <div className="team-row"><div className="team-row__avatar" aria-hidden="true">{member.role === "organization_owner" ? <Crown size={19}/> : <Users size={19}/>}</div><div className="team-row__identity"><strong>{member.email}</strong><span>{self ? (english ? "Your account" : "Votre compte") : (active ? (english ? "Active member" : "Membre actif") : (english ? "Revoked" : "Révoqué"))}</span></div><Badge tone={active ? "success" : "neutral"}>{ROLE_LABELS[member.role][english ? "en" : "fr"]}</Badge>{active && !self && member.role !== "organization_owner" ? <div className="team-row__actions"><label className="sr-only" htmlFor={`role-${member.membershipId}`}>{english ? "Role" : "Rôle"}</label><select id={`role-${member.membershipId}`} value={role} onChange={(event) => setRole(event.target.value as InternalRole)}>{ASSIGNABLE_ROLES.map((value) => <option key={value} value={value}>{ROLE_LABELS[value][english ? "en" : "fr"]}</option>)}</select><button className="button button--secondary button--small" disabled={busyKey !== null || role === member.role} onClick={() => run({ action: "change_role", membershipId: member.membershipId, role }, `role-${member.membershipId}`)} type="button">{english ? "Apply" : "Appliquer"}</button><button className="button button--ghost button--small" disabled={busyKey !== null} onClick={() => run({ action: "transfer_owner", membershipId: member.membershipId }, `owner-${member.membershipId}`)} type="button"><Crown size={15}/>{english ? "Transfer" : "Transférer"}</button><button className="button button--danger button--small" disabled={busyKey !== null} onClick={() => run({ action: "revoke_member", membershipId: member.membershipId }, `member-${member.membershipId}`)} type="button"><UserMinus size={15}/>{english ? "Revoke" : "Révoquer"}</button></div> : null}</div>;
}

function invitationStatus(status: TeamData["invitations"][number]["status"], english: boolean) { const labels = { pending: ["En attente", "Pending"], accepted: ["Acceptée", "Accepted"], revoked: ["Révoquée", "Revoked"], expired: ["Expirée", "Expired"] } as const; return labels[status][english ? 1 : 0]; }
function auditLabel(action: string, english: boolean) { const labels: Record<string, [string, string]> = { "member.invited": ["Membre invité", "Member invited"], "member.invitation_resent": ["Invitation relancée", "Invitation resent"], "member.invitation_revoked": ["Invitation révoquée", "Invitation revoked"], "member.invitation_accepted": ["Invitation acceptée", "Invitation accepted"], "member.role_changed": ["Rôle modifié", "Role changed"], "member.revoked": ["Membre révoqué", "Member revoked"], "owner.transferred": ["Propriété transférée", "Ownership transferred"] }; return labels[action]?.[english ? 1 : 0] ?? action; }
