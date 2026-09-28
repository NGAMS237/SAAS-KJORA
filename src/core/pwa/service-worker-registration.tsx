"use client";
import { useEffect,useState } from "react";

export function ServiceWorkerRegistration(){
  const [updateReady,setUpdateReady]=useState(false);
  useEffect(()=>{
    if(!("serviceWorker" in navigator)||process.env.NODE_ENV!=="production")return;
    let active=true;
    navigator.serviceWorker.register("/sw.js",{scope:"/"}).then((registration)=>{
      if(registration.waiting&&active)setUpdateReady(true);
      registration.addEventListener("updatefound",()=>{
        const worker=registration.installing;
        worker?.addEventListener("statechange",()=>{if(worker.state==="installed"&&navigator.serviceWorker.controller&&active)setUpdateReady(true)});
      });
    }).catch(()=>undefined);
    return()=>{active=false};
  },[]);
  if(!updateReady)return null;
  return <button className="pwa-update" type="button" onClick={()=>window.location.reload()}>Une mise à jour KJORA est prête · Reload</button>;
}
