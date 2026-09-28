"use client";
import { useEffect,useState } from "react";
export function PartnerApplicationStatus({applicationId,token,locale}:{applicationId:string;token:string;locale:"fr"|"en"}){
  const [status,setStatus]=useState("loading");const t=(fr:string,en:string)=>locale==="en"?en:fr;
  useEffect(()=>{fetch(`/api/partners/applications?applicationId=${encodeURIComponent(applicationId)}&token=${encodeURIComponent(token)}`)
    .then(async r=>{const p=await r.json();setStatus(r.ok?p.status:"unavailable")}).catch(()=>setStatus("unavailable"))},[applicationId,token]);
  const labels:Record<string,string>={loading:t("Chargement…","Loading…"),submitted:t("Reçue","Received"),under_review:t("En cours d’étude","Under review"),approved:t("Approuvée","Approved"),refused:t("Non retenue","Not selected"),suspended:t("Suspendue","Suspended"),unavailable:t("Suivi indisponible","Tracking unavailable")};
  return <p className="form-feedback" role="status">{t("Statut : ","Status: ")}<strong>{labels[status]??status}</strong></p>;
}
