"use client";
import { useEffect,useState } from "react";
import { usePreferences } from "@/core/preferences/preferences-provider";

export function ServiceWorkerRegistration(){
  const {language}=usePreferences();
  const english=language==="EN";
  const [updateReady,setUpdateReady]=useState(false);
  const [online,setOnline]=useState(()=>typeof navigator==="undefined"?true:navigator.onLine);
  const [restored,setRestored]=useState(false);
  useEffect(()=>{
    const markOffline=()=>{setOnline(false);setRestored(false)};
    const markOnline=()=>{setOnline(true);setRestored(true);window.setTimeout(()=>setRestored(false),5000)};
    window.addEventListener("offline",markOffline);
    window.addEventListener("online",markOnline);
    let active=true;
    if("serviceWorker" in navigator&&process.env.NODE_ENV==="production"){
      navigator.serviceWorker.register("/sw.js",{scope:"/"}).then((registration)=>{
        if(registration.waiting&&active)setUpdateReady(true);
        registration.addEventListener("updatefound",()=>{
          const worker=registration.installing;
          worker?.addEventListener("statechange",()=>{if(worker.state==="installed"&&navigator.serviceWorker.controller&&active)setUpdateReady(true)});
        });
      }).catch(()=>undefined);
    }
    return()=>{active=false;window.removeEventListener("offline",markOffline);window.removeEventListener("online",markOnline)};
  },[]);
  return <>
    {!online?<div className="connectivity-banner" role="alert" aria-live="assertive"><strong>{english?"You are offline.":"Vous êtes hors ligne."}</strong><span>{english?"Private data is unavailable until you reconnect.":"Les données privées restent indisponibles jusqu’au retour de la connexion."}</span><button type="button" onClick={()=>window.location.reload()}>{english?"Try again":"Réessayer"}</button></div>:null}
    {restored?<div className="connectivity-banner connectivity-banner--online" role="status" aria-live="polite">{english?"Connection restored. You can safely continue.":"Connexion rétablie. Vous pouvez reprendre en toute sécurité."}</div>:null}
    {updateReady?<button className="pwa-update" type="button" onClick={()=>window.location.reload()}>{english?"A KJORA update is ready · Reload":"Une mise à jour KJORA est prête · Recharger"}</button>:null}
  </>;
}
