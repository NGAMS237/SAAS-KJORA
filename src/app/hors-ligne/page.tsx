import Link from "next/link";
export default function OfflinePage(){
  return <main className="auth-page"><section className="auth-panel"><span className="wordmark wordmark--auth">Kjora<span>.</span></span>
    <p className="eyebrow">Hors ligne / Offline</p><h1>Connexion indisponible.</h1>
    <p>Pour protéger vos données, KJORA ne met jamais en cache les loyers, contrats, paiements ni pages authentifiées.</p>
    <p>Your private rental data is never stored in the offline cache. Reconnect to continue securely.</p>
    <Link className="button button--primary" href="/">Réessayer / Try again</Link>
  </section></main>;
}
