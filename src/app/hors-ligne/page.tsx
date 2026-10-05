"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePreferences } from "@/core/preferences/preferences-provider";
import { probePublicConnectivity } from "@/core/pwa/connectivity";
export default function OfflinePage(){
  const router=useRouter();const {language}=usePreferences();const english=language==="EN";
  const [checking,setChecking]=useState(false);const [stillOffline,setStillOffline]=useState(false);
  const retry=async()=>{setChecking(true);setStillOffline(false);const reachable=navigator.onLine&&await probePublicConnectivity();setChecking(false);if(reachable){router.push("/");router.refresh()}else setStillOffline(true)};
  return <main className="auth-page"><section className="auth-panel"><span className="wordmark wordmark--auth">Kjora<span>.</span></span>
    <p className="eyebrow">{english?"Offline":"Hors ligne"}</p><h1>{english?"Connection unavailable.":"Connexion indisponible."}</h1>
    <p>{english?"KJORA only keeps a small public shell available. Your rents, contracts, payments, documents and authenticated pages are never stored in the offline cache.":"KJORA conserve uniquement une interface publique minimale et ne met jamais en cache vos loyers, contrats, paiements, documents ou pages authentifiées."}</p>
    <p>{english?"Reconnect to safely continue. Work entered while offline is not queued or sent.":"Reconnectez-vous pour reprendre en toute sécurité. Aucun travail saisi hors ligne n’est mis en file ni envoyé."}</p>
    <button className="button button--primary" type="button" onClick={()=>void retry()} disabled={checking}>{checking?(english?"Checking…":"Vérification…"):(english?"Try again":"Réessayer")}</button>
    {stillOffline?<p role="status" aria-live="polite">{english?"The connection is still unavailable.":"La connexion reste indisponible."}</p>:null}
  </section></main>;
}
