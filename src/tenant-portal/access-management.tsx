"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MailPlus, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { Badge, Card } from "@/core/ui/ui";
import { usePreferences } from "@/core/preferences/preferences-provider";
import type { PortalAccessStatus } from "@/tenant-portal/model";

type LeaseOption = { id: string; label: string; status: "active" | "ended" | "draft" };

export function TenantPortalAccessManagement({
  email, leases, status, tenantId,
}: {
  email: string | null;
  leases: LeaseOption[];
  status: PortalAccessStatus | null;
  tenantId: string;
}) {
  const router = useRouter();
  const { language } = usePreferences();
  const en = language === "EN";
  const eligible = leases.filter((lease) => lease.status !== "draft");
  const [leaseIds, setLeaseIds] = useState<string[]>(status?.leaseIds.length ? status.leaseIds : eligible.map((lease) => lease.id));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function run(payload: Record<string, unknown>) {
    setBusy(true); setMessage(null);
    const response = await fetch("/api/tenant-portal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(result.error === "email_delivery_failed" ? (en ? "The invitation could not be delivered." : "L’invitation n’a pas pu être envoyée.") : (en ? "The action was refused." : "L’action a été refusée."));
      return;
    }
    setMessage(en ? "Portal access updated." : "Accès portail mis à jour."); router.refresh();
  }
  function toggle(id: string) { setLeaseIds((values) => values.includes(id) ? values.filter((value) => value !== id) : [...values, id]); }
  const tone = status?.status === "active" ? "success" : status?.status === "invited" ? "warning" : "neutral";
  const statusLabel = status?.status === "active" ? (en ? "Active" : "Actif") : status?.status === "invited" ? (en ? "Invited" : "Invité") : (en ? "Revoked" : "Révoqué");
  const invitationStatusLabel = status?.invitationStatus === "pending" ? (en ? "Pending" : "En attente") : status?.invitationStatus === "accepted" ? (en ? "Accepted" : "Acceptée") : status?.invitationStatus === "expired" ? (en ? "Expired" : "Expirée") : status?.invitationStatus === "revoked" ? (en ? "Revoked" : "Révoquée") : null;
  const locale = en ? "en-GB" : "fr-FR";
  return <Card className="tenant-portal-management" id="portail"><div className="section-heading"><div><p className="eyebrow">Tenant Portal Access</p><h2>{en ? "Tenant portal" : "Portail locataire"}</h2></div>{status ? <Badge tone={tone}>{statusLabel}</Badge> : <ShieldCheck size={21} />}</div>
    <p>{en ? "This access is separate from internal Memberships and only exposes the selected leases." : "Cet accès est distinct des Memberships internes et expose uniquement les locations sélectionnées."}</p>
    {!email ? <p className="form-feedback form-feedback--error">{en ? "Add a usable email to this tenant record first." : "Ajoutez d’abord un email exploitable au dossier locataire."}</p> : <p className="demo-hint">{en ? `Invitation email: ${email}` : `Email d’invitation : ${email}`}</p>}
    {status ? <dl className="record-detail-list"><div><dt>{en ? "Status" : "État"}</dt><dd>{statusLabel}</dd></div>{invitationStatusLabel ? <div><dt>{en ? "Invitation" : "Invitation"}</dt><dd>{invitationStatusLabel}</dd></div> : null}{status.invitationExpiresAt ? <div><dt>{en ? "Invitation expires" : "Expiration de l’invitation"}</dt><dd>{new Date(status.invitationExpiresAt).toLocaleString(locale)}</dd></div> : null}<div><dt>{en ? "Last sign-in" : "Dernière connexion"}</dt><dd>{status.lastLoginAt ? new Date(status.lastLoginAt).toLocaleString(locale) : "—"}</dd></div></dl> : null}
    {status?.status !== "active" ? <fieldset className="portal-lease-scope"><legend>{en ? "Authorized leases" : "Locations autorisées"}</legend>{eligible.map((lease) => <label key={lease.id}><input checked={leaseIds.includes(lease.id)} onChange={() => toggle(lease.id)} type="checkbox" /><span>{lease.label}</span><Badge tone={lease.status === "active" ? "success" : "neutral"}>{lease.status}</Badge></label>)}</fieldset> : null}
    <div className="demo-form-actions">{!status || status.status === "revoked" ? <button className="button button--primary" disabled={busy || !email || !leaseIds.length} onClick={() => run({ action: "invite", tenantId, leaseIds })} type="button"><MailPlus size={16} />{en ? "Invite" : "Inviter"}</button> : null}{status?.status === "invited" ? <button className="button button--secondary" disabled={busy} onClick={() => run({ action: "resend", accessId: status.accessId })} type="button"><RefreshCw size={16} />{en ? "Resend" : "Relancer"}</button> : null}{status && status.status !== "revoked" ? <button className="button button--danger" disabled={busy} onClick={() => run({ action: "revoke", accessId: status.accessId })} type="button"><ShieldOff size={16} />{en ? "Revoke" : "Révoquer"}</button> : null}</div>
    {message ? <p className="form-feedback" role="status">{message}</p> : null}
  </Card>;
}
