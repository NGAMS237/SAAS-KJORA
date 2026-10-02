"use client";
import { useRouter } from "next/navigation";
import { usePreferences } from "@/core/preferences/preferences-provider";
export default function OfflinePage(){
  const router=useRouter();const {language}=usePreferences();const english=language==="EN";
  const retry=()=>{if(navigator.onLine){router.refresh();router.push("/")}else window.location.reload()};
  return <main className="auth-page"><section className="auth-panel"><span className="wordmark wordmark--auth">Kjora<span>.</span></span>
    <p className="eyebrow">{english?"Offline":"Hors ligne"}</p><h1>{english?"Connection unavailable.":"Connexion indisponible."}</h1>
    <p>{english?"KJORA only keeps a small public shell available. Your rents, contracts, payments, documents and authenticated pages are never stored in the offline cache.":"KJORA conserve uniquement une interface publique minimale et ne met jamais en cache vos loyers, contrats, paiements, documents ou pages authentifiées."}</p>
    <p>{english?"Reconnect to safely continue. Work entered while offline is not queued or sent.":"Reconnectez-vous pour reprendre en toute sécurité. Aucun travail saisi hors ligne n’est mis en file ni envoyé."}</p>
    <button className="button button--primary" type="button" onClick={retry}>{english?"Try again":"Réessayer"}</button>
  </section></main>;
}
