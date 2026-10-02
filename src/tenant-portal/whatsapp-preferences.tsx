"use client";
import { useState } from "react";

export function PortalWhatsAppPreferences({ accessId, language, hasPhone }: { accessId: string; language: "fr"|"en"; hasPhone: boolean }) {
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState<string|null>(null);
  const t=(fr:string,en:string)=>language==="en"?en:fr;
  async function save(action:"confirm"|"disable"){
    setBusy(true);setMessage(null);
    try{const response=await fetch("/api/tenant-portal/whatsapp",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({accessId,action})});
      setMessage(response.ok?t(action==="confirm"?"WhatsApp confirmé pour les communications de service. Le marketing reste désactivé.":"WhatsApp et le consentement de service ont été désactivés.",action==="confirm"?"WhatsApp confirmed for service communications. Marketing remains disabled.":"WhatsApp and service consent were disabled."):t("Modification impossible. Vérifiez votre session et votre numéro.","Unable to update. Check your session and phone number."));
    }catch{setMessage(t("Erreur temporaire. Réessayez.","Temporary error. Try again."));}finally{setBusy(false)}
  }
  return <div className="form-stack"><p>{t("Confirmer prouve uniquement que vous reconnaissez ce numéro pour WhatsApp. Cela autorise les communications nécessaires au service, jamais le marketing.","Confirmation only shows that you recognize this number for WhatsApp. It allows necessary service communications, never marketing.")}</p><div className="demo-form-actions"><button className="button button--primary" disabled={busy||!hasPhone} onClick={()=>void save("confirm")} type="button">{busy?t("Enregistrement…","Saving…"):t("Confirmer WhatsApp","Confirm WhatsApp")}</button><button className="button button--secondary" disabled={busy||!hasPhone} onClick={()=>void save("disable")} type="button">{t("Retirer le consentement","Withdraw consent")}</button></div>{!hasPhone?<small>{t("Ajoutez d'abord un numéro auprès de votre bailleur.","Ask your lessor to add a phone number first.")}</small>:null}{message?<p className="form-feedback" role="status" aria-live="polite">{message}</p>:null}</div>;
}
