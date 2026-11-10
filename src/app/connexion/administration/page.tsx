import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/core/auth/login-form";
import { resolvePlatformAdmin } from "@/core/authorization/platform-admin";

// Page de connexion dédiée à la console d'administration de la plateforme.
// Elle ne donne aucun droit : l'autorisation reste décidée côté serveur par
// resolvePlatformAdmin() (layout /administration + RPC assert_platform_admin).
export const metadata: Metadata = {
  title: "Connexion administrateur — Kjora",
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = "force-dynamic";

const CONSOLE_PATH = "/administration";

type Params = { reason?: string | string[] };

export default async function AdministrationLoginPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const reason = Array.isArray(params.reason) ? params.reason[0] : params.reason;
  const decision = await resolvePlatformAdmin();

  // Déjà administrateur : directement dans la console, sans second lien magique.
  if (decision.allowed) redirect(CONSOLE_PATH);

  const signedInWithoutAccess = decision.reason === "not_platform_admin";
  const checkFailed = decision.reason === "check_failed";

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <Link className="wordmark wordmark--auth" href="/">Kjora<span>.</span></Link>
        <p className="eyebrow">Console d’administration</p>
        <h1>Accès administrateur Kjora.</h1>
        <p className="auth-intro">
          Réservé à l’équipe d’administration de la plateforme. Ce compte est distinct de votre espace propriétaire : être propriétaire d’une organisation ne donne pas accès à la console.
        </p>

        {signedInWithoutAccess ? (
          <>
            <p className="form-feedback form-feedback--error" role="alert">
              Vous êtes connecté, mais ce compte n’est pas administrateur de la plateforme. Reconnectez-vous avec le compte administrateur.
            </p>
            <form action="/auth/signout" method="post">
              <button className="button button--secondary" type="submit">Changer de compte</button>
            </form>
            <p className="auth-footnote"><Link href="/app">Retourner à mon espace</Link></p>
          </>
        ) : (
          <>
            {checkFailed ? (
              <p className="form-feedback form-feedback--error" role="alert">
                La vérification de l’accès administrateur a échoué. Réessayez dans un instant.
              </p>
            ) : reason === "not-admin" ? (
              <p className="form-feedback form-feedback--error" role="alert">
                Votre session a expiré. Reconnectez-vous pour continuer.
              </p>
            ) : null}
            <LoginForm nextPath={CONSOLE_PATH} locale="fr" />
            <p className="auth-footnote">Un lien de connexion temporaire est envoyé à l’adresse e-mail de l’administrateur.</p>
          </>
        )}
      </section>
    </main>
  );
}
