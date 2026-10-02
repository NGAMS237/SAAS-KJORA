"use client";
import { useState } from "react";

export function PortalWhatsAppPreferences({ accessId, language, hasPhone }: { accessId: string; language: "fr"|"en"; hasPhone: boolean }) {
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState<string|null>(null);
  const t=(fr:string,en:string)=>language==="en"?en:fr;
  async function save(action:"confirm_service"|"disable"|"consent_marketing"|"revoke_marketing"){
    setBusy(true);setMessage(null);
    try{const response=await fetch("/api/tenant-portal/whatsapp",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({accessId,action})});
      setMessage(response.ok?t("Préférences WhatsApp enregistrées.","WhatsApp preferences saved."):t("Modification impossible. Vérifiez votre session et votre numéro.","Unable to update. Check your session and phone number."));
    }catch{setMessage(t("Erreur temporaire. Réessayez.","Temporary error. Try again."));}finally{setBusy(false)}
  }
  return <div className="form-stack"><p>{t("Cette confirmation signifie seulement que vous reconnaissez le numéro pour les communications de service. Elle ne vérifie pas votre identité. Le marketing exige une action séparée.","This confirmation only means that you recognize the number for service communications. It does not verify your identity. Marketing requires a separate action.")}</p><div className="demo-form-actions"><button className="button button--primary" disabled={busy||!hasPhone} onClick={()=>void save("confirm_service")} type="button">{busy?t("Enregistrement…","Saving…"):t("Confirmer pour le service","Confirm for service")}</button><button className="button button--secondary" disabled={busy||!hasPhone} onClick={()=>void save("disable")} type="button">{t("Retirer le consentement service","Withdraw service consent")}</button></div><div className="demo-form-actions"><button className="button button--secondary" disabled={busy||!hasPhone} onClick={()=>void save("consent_marketing")} type="button">{t("Accepter le marketing facultatif","Accept optional marketing")}</button><button className="button button--secondary" disabled={busy||!hasPhone} onClick={()=>void save("revoke_marketing")} type="button">{t("Refuser le marketing","Decline marketing")}</button></div>{!hasPhone?<small>{t("Ajoutez d'abord un numéro auprès de votre bailleur.","Ask your lessor to add a phone number first.")}</small>:null}{message?<p className="form-feedback" role="status" aria-live="polite">{message}</p>:null}</div>;
}
