"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_LABELS, type InternalRole } from "@/core/authorization/capabilities";
import { usePreferences } from "@/core/preferences/preferences-provider";

export function InvitationAcceptance({ organizationName, role }: { organizationName: string; role: InternalRole }) {
  const router = useRouter();
  const { language } = usePreferences();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const english = language === "EN";

  async function accept() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/team/invitations/accept", { method: "POST" });
    if (response.ok) {
      router.replace("/app");
      router.refresh();
      return;
    }
    setBusy(false);
    setMessage(english ? "This invitation is no longer valid." : "Cette invitation n’est plus valide.");
  }

  return <div className="invitation-acceptance">
    <p className="eyebrow">{english ? "Internal Organization Membership" : "Membership interne"}</p>
    <h1>{english ? `Join ${organizationName}` : `Rejoindre ${organizationName}`}</h1>
    <p>{english ? "Role offered:" : "Rôle proposé :"} <strong>{ROLE_LABELS[role][english ? "en" : "fr"]}</strong></p>
    <p>{english ? "No tenant data is accessible until you accept." : "Aucune donnée du tenant n’est accessible avant votre acceptation."}</p>
    <button className="button button--primary" disabled={busy} onClick={accept} type="button">
      {busy ? (english ? "Accepting…" : "Acceptation…") : (english ? "Accept invitation" : "Accepter l’invitation")}
    </button>
    {message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}
  </div>;
}
