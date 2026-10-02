"use client";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { usePreferences } from "@/core/preferences/preferences-provider";

export function ManualWhatsAppButton({ documentId, disabled }: { documentId: string; disabled?: boolean }) {
  const { language } = usePreferences(); const english = language === "EN";
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function open() {
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/communications/whatsapp/manual", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId }) });
      const payload = await response.json() as { url?: string; notice?: string };
      if (!response.ok || !payload.url) { popup?.close(); setMessage(english ? "WhatsApp is unavailable: check the number, declaration and service consent." : "WhatsApp est indisponible : vérifiez le numéro, la déclaration et le consentement de service."); return; }
      if (popup) popup.location.replace(payload.url); else window.location.assign(payload.url);
      setMessage(payload.notice ?? "");
    } catch { popup?.close(); setMessage(english ? "Temporary error. Try again." : "Erreur temporaire. Réessayez."); }
    finally { setBusy(false); }
  }
  return <span><button className="button button--secondary" disabled={disabled || busy} onClick={open} type="button"><MessageCircle aria-hidden="true" size={15}/>{busy ? (english ? "Opening…" : "Ouverture…") : (english ? "Open WhatsApp" : "Ouvrir WhatsApp")}</button>{message ? <small aria-live="polite" role="status">{message}</small> : null}</span>;
}
