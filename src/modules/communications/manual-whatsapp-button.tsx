"use client";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { usePreferences } from "@/core/preferences/preferences-provider";

// Envoi WhatsApp d'un document financier (reçu, quittance, avis, état de compte) : le PDF est joint au message.
// Téléphone : la feuille de partage envoie le fichier et le texte (choisir WhatsApp et le contact, puis « Envoyer »).
// Ordinateur : WhatsApp s'ouvre sur le bon numéro avec le message, et le PDF se télécharge pour être glissé dans la conversation.
export function ManualWhatsAppButton({ documentId, disabled }: { documentId: string; disabled?: boolean }) {
  const { language } = usePreferences(); const english = language === "EN";
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function loadFile(): Promise<File | null> {
    try {
      const response = await fetch(`/api/financial-documents/${documentId}/file`, { credentials: "same-origin" });
      if (!response.ok) return null;
      const blob = await response.blob();
      return new File([blob], decodeURIComponent(response.headers.get("x-file-name") ?? "document.pdf"), { type: "application/pdf" });
    } catch { return null; }
  }
  async function open() {
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    setBusy(true); setMessage(null);
    try {
      const file = await loadFile();
      const response = await fetch("/api/communications/whatsapp/manual", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId, withPdf: file !== null }) });
      const payload = await response.json() as { url?: string; message?: string; notice?: string };
      if (!response.ok || !payload.url) { popup?.close(); setMessage(english ? "WhatsApp is unavailable: check the number, declaration and service consent." : "WhatsApp est indisponible : vérifiez le numéro, la déclaration et le consentement de service."); return; }
      if (file && payload.message && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        popup?.close();
        try { await navigator.share({ files: [file], text: payload.message }); setMessage(payload.notice ?? ""); return; }
        catch (error) { if ((error as { name?: string }).name === "AbortError") return; }
      }
      if (file) {
        const href = URL.createObjectURL(file);
        const link = document.createElement("a"); link.href = href; link.download = file.name; link.click();
        setTimeout(() => URL.revokeObjectURL(href), 10_000);
      }
      if (popup && !popup.closed) popup.location.replace(payload.url); else window.open(payload.url, "_blank", "noopener,noreferrer");
      const attach = file ? (english ? " The PDF was downloaded: drag it into the conversation, then send." : " Le PDF vient d’être téléchargé : glissez-le dans la conversation, puis envoyez.") : "";
      setMessage(`${payload.notice ?? ""}${attach}`.trim());
    } catch { popup?.close(); setMessage(english ? "Temporary error. Try again." : "Erreur temporaire. Réessayez."); }
    finally { setBusy(false); }
  }
  return <span><button className="button button--secondary" disabled={disabled || busy} onClick={open} type="button"><MessageCircle aria-hidden="true" size={15}/>{busy ? (english ? "Opening…" : "Ouverture…") : (english ? "Send on WhatsApp with PDF" : "Envoyer sur WhatsApp avec le PDF")}</button>{message ? <small aria-live="polite" role="status">{message}</small> : null}</span>;
}
