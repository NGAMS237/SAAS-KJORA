"use client";
import { useCallback, useEffect, useReducer, useState } from "react";
import { usePreferences } from "@/core/preferences/preferences-provider";
import { probePublicConnectivity, reduceConnectivity } from "@/core/pwa/connectivity";

export function ServiceWorkerRegistration(){
  const {language}=usePreferences();
  const english=language==="EN";
  const [updateReady,setUpdateReady]=useState(false);
  const [connectivity,dispatchConnectivity]=useReducer(reduceConnectivity,"checking");
  const [restored,setRestored]=useState(false);
  const verifyConnectivity=useCallback(async()=>{
    dispatchConnectivity({type:"check_started"});
    if(!navigator.onLine){dispatchConnectivity({type:"browser_offline"});return false}
    const reachable=await probePublicConnectivity();
    dispatchConnectivity({type:reachable?"check_succeeded":"check_failed"});
    return reachable;
  },[]);
  useEffect(()=>{
    let active=true;
    const markOffline=()=>{dispatchConnectivity({type:"browser_offline"});setRestored(false)};
    const markOnline=()=>{void verifyConnectivity().then((reachable)=>{if(active&&reachable){setRestored(true);window.setTimeout(()=>setRestored(false),5000)}})};
    window.addEventListener("offline",markOffline);
    window.addEventListener("online",markOnline);
    void verifyConnectivity();
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
  },[verifyConnectivity]);
  return <>
    {connectivity==="offline"?<div className="connectivity-banner" role="alert" aria-live="assertive"><strong>{english?"You are offline.":"Vous êtes hors ligne."}</strong><span>{english?"Public pages may remain available, but private data and financial or contractual actions require a connection.":"Les pages publiques peuvent rester disponibles, mais les données privées et les opérations financières ou contractuelles exigent une connexion."}</span><button type="button" onClick={()=>void verifyConnectivity()}>{english?"Try again":"Réessayer"}</button></div>:null}
    {restored?<div className="connectivity-banner connectivity-banner--online" role="status" aria-live="polite">{english?"Connection restored. You can safely continue.":"Connexion rétablie. Vous pouvez reprendre en toute sécurité."}</div>:null}
    {updateReady?<button className="pwa-update" type="button" onClick={()=>window.location.reload()}>{english?"A KJORA update is ready · Reload":"Une mise à jour KJORA est prête · Recharger"}</button>:null}
  </>;
}
