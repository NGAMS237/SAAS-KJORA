"use client";

import { ErrorNotice } from "@/core/ui/ui";
import Link from "next/link";
import { usePreferences } from "@/core/preferences/preferences-provider";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const {language}=usePreferences();const english=language==="EN";
  return (
    <div className="page-stack">
      <ErrorNotice />
      <p role="alert" tabIndex={-1}>{english?"A temporary error interrupted this page. Your data was not confirmed as saved.":"Une erreur temporaire a interrompu cette page. Vos données ne sont pas considérées comme enregistrées."}</p>
      <div className="demo-form-actions"><button className="button button--primary" type="button" onClick={reset}>{english?"Try again":"Réessayer"}</button><Link className="button button--secondary" href="/connexion?reason=session-required&next=/app">{english?"Sign in again":"Se reconnecter"}</Link></div>
    </div>
  );
}
