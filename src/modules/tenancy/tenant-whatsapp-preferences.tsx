"use client";
import { FormEvent, useMemo, useState } from "react";
import { usePreferences } from "@/core/preferences/preferences-provider";
import { SUPPORTED_PHONE_COUNTRIES } from "@/core/currency/metadata";
import { normalizePhoneE164 } from "@/modules/communications/manual-whatsapp";

export function TenantWhatsAppPreferencesForm({tenantId}:{tenantId:string}){
 const {language}=usePreferences();const en=language==="EN";const t=(fr:string,enText:string)=>en?enText:fr;
 const [country,setCountry]=useState("CM");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
 const entry=useMemo(()=>SUPPORTED_PHONE_COUNTRIES.find((item)=>item.countryCode===country)!,[country]);
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setMessage("");const form=new FormData(event.currentTarget);const nationalNumber=String(form.get("nationalNumber")??"");const phoneE164=normalizePhoneE164(country,nationalNumber);
  if(!phoneE164){setBusy(false);setMessage(t("Numéro invalide.","Invalid number."));return;}
  const response=await fetch("/api/tenancy/whatsapp",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tenantId,countryCode:country,callingCode:entry.callingCode,nationalNumber,phoneE164,
   whatsappDeclared:form.get("whatsappDeclared")==="yes",preferredChannel:form.get("preferredChannel"),serviceConsent:form.get("serviceConsent")==="yes",marketingConsent:false})}).catch(()=>null);
  setBusy(false);setMessage(response?.ok?t("Préférences enregistrées. Le marketing reste sous le contrôle direct du locataire.","Preferences saved. Marketing remains under the tenant's direct control."):t("Enregistrement impossible.","Unable to save."));
 }
 return <form className="form-stack" onSubmit={submit}><p>{t("Le bailleur peut déclarer un numéro et le consentement de service communiqué par le locataire. Il ne peut jamais accepter le marketing à sa place.","The lessor may record a number and service consent communicated by the tenant. The lessor can never accept marketing on the tenant's behalf.")}</p>
  <label className="field"><span>{t("Pays du numéro","Phone country")}</span><select value={country} onChange={(event)=>setCountry(event.target.value)}>{SUPPORTED_PHONE_COUNTRIES.map((item)=><option key={item.countryCode} value={item.countryCode}>{item.label[en?"en":"fr"]} (+{item.callingCode})</option>)}</select></label>
  <label className="field"><span>{t(`Numéro national — ${entry.nationalLength} chiffres, sans 0 initial`,`National number — ${entry.nationalLength} digits, no leading 0`)}</span><input name="nationalNumber" inputMode="numeric" required/></label>
  <label className="field"><span>{t("Canal préféré","Preferred channel")}</span><select name="preferredChannel" defaultValue="in_app"><option value="in_app">KJORA</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select></label>
  <label className="communication-toggle"><input name="whatsappDeclared" value="yes" type="checkbox"/><span>{t("Le locataire a déclaré utiliser ce numéro sur WhatsApp (non vérifié).","The tenant declared using this number on WhatsApp (not verified).")}</span></label>
  <label className="communication-toggle"><input name="serviceConsent" value="yes" type="checkbox"/><span>{t("Le locataire a consenti aux communications nécessaires au service.","The tenant consented to necessary service communications.")}</span></label>
  <button className="button button--primary" disabled={busy}>{busy?t("Enregistrement…","Saving…"):t("Enregistrer","Save")}</button>{message?<p className="form-feedback" role="status">{message}</p>:null}
 </form>;
}
