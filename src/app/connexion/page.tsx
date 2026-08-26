import Link from "next/link";
import { LoginForm } from "@/core/auth/login-form";
import { getAuthCallbackMessage } from "@/core/auth/callback-diagnostics";
import { safeNextPath } from "@/core/auth/safe-next-path";

type LoginPageProps = {
  searchParams: Promise<{ reason?: string | string[]; next?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const reason = Array.isArray(params.reason) ? params.reason[0] : params.reason;
  const requestedNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const nextPath = safeNextPath(requestedNext);
  const callbackMessage = getAuthCallbackMessage(reason);
  const pinMessage = reason === "pin-attempts-exceeded"
    ? "Pour protéger votre compte, reconnectez-vous avec votre email."
    : reason === "pin-email-required"
      ? "Reconnectez-vous avec votre email pour continuer sans le verrou PIN."
      : null;

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <Link className="wordmark wordmark--auth" href="/">Kjora<span>.</span></Link>
        <p className="eyebrow">Accès sécurisé</p>
        <h1>Retrouvez votre espace locatif.</h1>
        <p className="auth-intro">Recevez un lien sécurisé par email. Le code reste disponible comme alternative.</p>
        {callbackMessage || pinMessage ? (
          <p className="form-feedback form-feedback--error" role="alert">
            {callbackMessage ?? pinMessage}
          </p>
        ) : null}
        <LoginForm nextPath={nextPath} />
        <p className="auth-footnote">Aucun mot de passe à mémoriser. Les accès expirent et ne donnent aucune autorisation hors de vos Organizations.</p>
      </section>
    </main>
  );
}
