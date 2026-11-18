"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Card } from "@/core/ui/ui";
import { buildWhatsAppUrl } from "@/modules/communications/manual-whatsapp";
import { normalizeTenantPhone } from "@/modules/communications/message-templates";
import { buildPaymentReceiptMessage } from "./receipt-message";

type ReceiptFile = { state: "loading" } | { state: "none" } | { state: "ready"; file: File };

export type PaymentWhatsAppProps = {
  payment: {
    id: string; tenantName: string; unitLabel: string; amountXaf: number; paymentDate: string; creditCreatedXaf: number; balanceAfterXaf: number;
    allocations: Array<{ periodStart: string; dueKind: string }>;
  };
  methodLabel: string;
  phone: string | null;
  civility: "M." | "Mme" | null;
  receiptId: string | null;
  canPrepareReceipt: boolean;
  autoPrepare: boolean;
};

// Après un encaissement : message WhatsApp adapté au reçu (solde, acompte ou avance) avec le PDF joint.
export function PaymentWhatsAppCard({ payment, methodLabel, phone, civility, receiptId, canPrepareReceipt, autoPrepare }: PaymentWhatsAppProps) {
  const [receipt, setReceipt] = useState<ReceiptFile>(receiptId || (autoPrepare && canPrepareReceipt) ? { state: "loading" } : { state: "none" });
  const [edited, setEdited] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => { void Promise.resolve().then(() => setPortalUrl(`${window.location.origin}/portal/recus/`)); }, []);

  async function loadFile(documentId: string): Promise<File | null> {
    try {
      const response = await fetch(`/api/financial-documents/${documentId}/file`, { credentials: "same-origin" });
      if (!response.ok) return null;
      const blob = await response.blob();
      const name = decodeURIComponent(response.headers.get("x-file-name") ?? "Reçu de paiement.pdf");
      return new File([blob], name, { type: "application/pdf" });
    } catch { return null; }
  }

  async function prepareReceipt(): Promise<string | null> {
    try {
      const response = await fetch("/api/financial-documents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "prepare_payment_receipt", paymentId: payment.id }) });
      const body = (await response.json().catch(() => ({}))) as { documentId?: unknown };
      return response.ok && typeof body.documentId === "string" ? body.documentId : null;
    } catch { return null; }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!receiptId && !(autoPrepare && canPrepareReceipt)) return;
    (async () => {
      const documentId = receiptId ?? await prepareReceipt();
      const file = documentId ? await loadFile(documentId) : null;
      setReceipt(file ? { state: "ready", file } : { state: "none" });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const withPdf = receipt.state === "ready";
  const generated = buildPaymentReceiptMessage({
    tenantName: payment.tenantName, civility, unitLabel: payment.unitLabel, amountXaf: payment.amountXaf, paymentDate: payment.paymentDate, methodLabel,
    allocations: payment.allocations, creditCreatedXaf: payment.creditCreatedXaf, balanceAfterXaf: payment.balanceAfterXaf, withPdf, portalUrl,
  });
  const text = edited ?? generated.body;
  const normalized = normalizeTenantPhone(phone);
  const whatsapp = normalized ? buildWhatsAppUrl(normalized, text) : null;
  const kindLabel = generated.kind === "settled" ? "Paiement qui solde le compte" : generated.kind === "partial" ? "Paiement partiel (acompte)" : "Paiement en avance (crédit)";

  async function send() {
    setInfo(null);
    if (receipt.state === "ready" && typeof navigator.canShare === "function" && navigator.canShare({ files: [receipt.file] })) {
      try { await navigator.share({ files: [receipt.file], text }); return; }
      catch (error) { if ((error as { name?: string }).name === "AbortError") return; }
    }
    if (receipt.state === "ready") {
      const url = URL.createObjectURL(receipt.file);
      const link = document.createElement("a"); link.href = url; link.download = receipt.file.name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setInfo("Le reçu PDF vient d’être téléchargé : glissez-le dans la conversation WhatsApp qui s’ouvre, puis envoyez.");
    }
    if (whatsapp) window.open(whatsapp, "_blank", "noopener,noreferrer");
  }

  return (
    <Card className="payment-whatsapp-card">
      <div className="section-heading"><div><p className="eyebrow">WhatsApp</p><h2>Envoyer le reçu au locataire</h2></div><MessageCircle size={21} /></div>
      <p className="field-help">{kindLabel} : le message ci-dessous correspond au reçu PDF. Relisez-le, modifiez-le si besoin, puis envoyez.</p>
      <label className="field"><span>Message (modifiable)</span><textarea onChange={(event) => setEdited(event.target.value)} rows={7} value={text} /></label>
      <div className="demo-form-actions">
        <button className="button button--primary" disabled={receipt.state === "loading" || !whatsapp} onClick={() => void send()} type="button">
          <MessageCircle aria-hidden="true" size={16} /> {receipt.state === "loading" ? "Préparation du reçu…" : withPdf ? "Envoyer sur WhatsApp avec le reçu PDF" : "Ouvrir WhatsApp"}
        </button>
        {edited !== null ? <button className="button button--secondary" onClick={() => setEdited(null)} type="button">Rétablir le message</button> : null}
      </div>
      {!whatsapp ? <p className="form-feedback" role="status">Pas de numéro WhatsApp reconnu pour ce locataire : ajoutez-le sur sa fiche.</p> : null}
      {receipt.state === "none" ? <p className="muted-note">Le reçu PDF n’est pas encore prêt ou approuvé : le message part sans pièce jointe, avec le lien du portail.</p> : null}
      {withPdf ? <p className="muted-note">Pièce jointe : {receipt.file.name}</p> : null}
      {info ? <p className="form-feedback" role="status">{info}</p> : null}
      <p className="muted-note">Rien n’est envoyé automatiquement : vous validez l’envoi dans WhatsApp. Le lien du portail ne fonctionne que si le locataire a un accès portail.</p>
    </Card>
  );
}
