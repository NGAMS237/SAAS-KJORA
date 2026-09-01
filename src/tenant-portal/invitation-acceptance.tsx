"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PortalInvitationAcceptance({ language, organizationName, tenantName }: { language: "fr" | "en"; organizationName: string; tenantName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function accept() {
    setBusy(true); setMessage(null);
    const response = await fetch("/api/tenant-portal/invitations/accept", { method: "POST" });
    if (response.ok) { router.replace("/portal"); router.refresh(); return; }
    setBusy(false); setMessage(language === "en" ? "This invitation is no longer valid or does not match your verified email." : "Cette invitation n’est plus valide ou ne correspond pas à votre email vérifié.");
  }
  return <div className="invitation-acceptance"><p className="eyebrow">Tenant Portal Access</p><h1>{language === "en" ? `Access ${organizationName}` : `Accéder à ${organizationName}`}</h1><p>{language === "en" ? <>The portal will be linked to <strong>{tenantName}</strong>, without creating an internal Membership.</> : <>Le portail sera relié au dossier de <strong>{tenantName}</strong>, sans créer de Membership interne.</>}</p><button className="button button--primary" disabled={busy} onClick={accept} type="button">{busy ? (language === "en" ? "Activating…" : "Activation…") : (language === "en" ? "Activate my portal" : "Activer mon portail")}</button>{message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}</div>;
}
