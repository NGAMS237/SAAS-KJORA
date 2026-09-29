"use client";
import { FormEvent, useState } from "react";
import { PARTNER_TERMS_VERSION } from "./program";

export function PartnerApplicationForm({locale}:{locale:"fr"|"en"}){
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [trackingUrl,setTrackingUrl]=useState("");
  const [copied,setCopied]=useState(false);
  const t=(fr:string,en:string)=>locale==="en"?en:fr;
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage("");
    const form=new FormData(event.currentTarget);
    try {
      const response=await fetch("/api/partners/applications",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        name:form.get("name"),email:form.get("email"),partnerType:form.get("partnerType"),motivation:form.get("motivation"),locale,
        termsAccepted:form.get("termsAccepted") === "yes",termsVersion:PARTNER_TERMS_VERSION,
      })});
      const payload=await response.json() as {applicationId?:string;statusToken?:string};
      if(response.ok&&payload.applicationId&&payload.statusToken)setTrackingUrl(`/partenaires/suivi?applicationId=${encodeURIComponent(payload.applicationId)}&token=${encodeURIComponent(payload.statusToken)}&locale=${locale}`);
      setMessage(response.ok
        ? t("Candidature reçue. Conservez votre lien privé de suivi.","Application received. Keep your private tracking link.")
        : response.status===409?t("Une candidature ouverte existe déjà pour cet email.","An open application already exists for this email.")
        : t("Envoi impossible. Vérifiez les champs ou réessayez plus tard.","Unable to submit. Check the fields or try again later."));
    } catch { setMessage(t("Service temporairement indisponible. Réessayez.","Service temporarily unavailable. Please retry.")); }
    finally { setBusy(false); }
  }
  return <form className="form-stack" onSubmit={submit}>
    <label className="field"><span>{t("Nom complet","Full name")}</span><input name="name" minLength={2} maxLength={120} required/></label>
    <label className="field"><span>Email</span><input name="email" type="email" maxLength={254} required/></label>
    <label className="field"><span>{t("Profil","Profile")}</span><select name="partnerType"><option value="commercial">{t("Commercial","Sales partner")}</option><option value="referral_partner">{t("Apporteur d’affaires","Referral partner")}</option><option value="influencer">{t("Influenceur","Creator / influencer")}</option><option value="agency">{t("Agence partenaire","Partner agency")}</option></select></label>
    <label className="field"><span>{t("Votre projet","Your project")}</span><textarea name="motivation" minLength={20} maxLength={2000} required/></label>
    <label className="communication-toggle"><input name="termsAccepted" value="yes" type="checkbox" required/><span>{t("J’accepte que KJORA étudie cette candidature selon les conditions du programme pilote.","I agree that KJORA may review this application under the pilot program terms.")}</span></label>
    <button className="button button--primary" disabled={busy}>{busy?t("Envoi…","Sending…"):t("Devenir partenaire","Apply to become a partner")}</button>
    {message?<p className="form-feedback" role="status">{message}</p>:null}
    {trackingUrl?<div className="admin-actions-row"><a className="button button--secondary" href={trackingUrl}>{t("Suivre ma candidature","Track my application")}</a><button className="button button--secondary" onClick={async()=>{await navigator.clipboard.writeText(new URL(trackingUrl,window.location.origin).toString());setCopied(true)}} type="button">{t("Copier le lien privé","Copy private link")}</button>{copied?<span role="status">{t("Copié","Copied")}</span>:null}</div>:null}
  </form>;
}
