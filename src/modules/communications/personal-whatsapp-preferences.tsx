"use client";

import { FormEvent, useMemo, useState } from "react";
import { SUPPORTED_PHONE_COUNTRIES } from "@/core/currency/metadata";
import { normalizePhoneE164 } from "./manual-whatsapp";

export type PersonalWhatsAppPreferences = {
  countryCode?: string; nationalNumber?: string; preferredChannel?: string;
  whatsappDeclared?: boolean; serviceConsent?: boolean; marketingConsent?: boolean;
};

export function PersonalWhatsAppPreferencesForm({ initial = {}, language = "fr", compact = false }:{ initial?:PersonalWhatsAppPreferences; language?:"fr"|"en"; compact?:boolean }) {
  const [country,setCountry]=useState(initial.countryCode ?? "CM");
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  const entry=useMemo(()=>SUPPORTED_PHONE_COUNTRIES.find((item)=>item.countryCode===country)!,[country]);
  const t=(fr:string,en:string)=>language==="en"?en:fr;
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage("");const form=new FormData(event.currentTarget);
    const nationalNumber=String(form.get("nationalNumber")??"");const phoneE164=normalizePhoneE164(country,nationalNumber);
    if(!phoneE164){setBusy(false);setMessage(t("Numéro invalide pour le pays choisi.","Invalid number for the selected country."));return;}
    try{const response=await fetch("/api/profile/whatsapp",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({countryCode:country,callingCode:entry.callingCode,nationalNumber,phoneE164,
      whatsappDeclared:form.get("whatsappDeclared")==="yes",preferredChannel:form.get("preferredChannel"),serviceConsent:form.get("serviceConsent")==="yes",marketingConsent:form.get("marketingConsent")==="yes"})});
      setMessage(response.ok?t("Préférences enregistrées.","Preferences saved."):t("Enregistrement impossible.","Unable to save."));
    }catch{setMessage(t("Service temporairement indisponible.","Service temporarily unavailable."));}finally{setBusy(false)}
  }
  return <form className={compact?"form-stack form-stack--compact":"form-stack"} onSubmit={submit}>
    <p>{t("Ce numéro personnel sert seulement à vos préférences de communication. Il ne prouve ni identité, ni rôle, ni autorisation.","This personal number is only used for communication preferences. It proves no identity, role, or authorization.")}</p>
    <label className="field"><span>{t("Pays du numéro","Phone country")}</span><select name="countryCode" value={country} onChange={(event)=>setCountry(event.target.value)}>{SUPPORTED_PHONE_COUNTRIES.map((item)=><option key={item.countryCode} value={item.countryCode}>{item.label[language]}</option>)}</select></label>
    <p className="demo-hint">{t("Indicatif en lecture seule","Read-only calling code")}: <strong>+{entry.callingCode}</strong></p>
    <label className="field"><span>{t(`Numéro national — ${entry.nationalLength} chiffres. Exemple : ${entry.nationalExample}`,`National number — ${entry.nationalLength} digits. Example: ${entry.nationalExample}`)}</span><input name="nationalNumber" defaultValue={initial.nationalNumber} inputMode="numeric" pattern={entry.nationalPattern} placeholder={entry.nationalExample} required/></label>
    <label className="field"><span>{t("Canal préféré","Preferred channel")}</span><select name="preferredChannel" defaultValue={initial.preferredChannel??"in_app"}><option value="in_app">KJORA</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select></label>
    <label className="communication-toggle"><input name="whatsappDeclared" value="yes" type="checkbox" defaultChecked={initial.whatsappDeclared}/><span>{t("Je déclare utiliser ce numéro sur WhatsApp (non vérifié).","I declare that I use this number on WhatsApp (not verified).")}</span></label>
    <label className="communication-toggle"><input name="serviceConsent" value="yes" type="checkbox" defaultChecked={initial.serviceConsent}/><span>{t("J’accepte les communications nécessaires au service.","I agree to necessary service communications.")}</span></label>
    <label className="communication-toggle"><input name="marketingConsent" value="yes" type="checkbox" defaultChecked={initial.marketingConsent}/><span>{t("J’accepte séparément les communications marketing facultatives.","I separately agree to optional marketing communications.")}</span></label>
    <button className="button button--primary" disabled={busy}>{busy?t("Enregistrement…","Saving…"):t("Enregistrer mes préférences","Save my preferences")}</button>{message?<p className="form-feedback" role="status">{message}</p>:null}
  </form>;
}
