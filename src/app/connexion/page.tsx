import Link from "next/link";
import { LoginForm } from "@/core/auth/login-form";
import { getAuthCallbackMessage } from "@/core/auth/callback-diagnostics";
import { safeNextPath } from "@/core/auth/safe-next-path";
import { parsePlanRequested, planLabel } from "@/core/onboarding/plan-intent";
import { PublicFooter } from "@/core/ui/public-footer";

// ALIGN-02: plan_requested comes from the marketing site CTA.
// It is non-trustworthy — validated here only for UX messaging.
// Never used to assign a plan or grant entitlements.
type LoginPageProps = {
  searchParams: Promise<{
    reason?: string | string[];
    next?: string | string[];
    plan_requested?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const reason = Array.isArray(params.reason) ? params.reason[0] : params.reason;
  const rawPlanRequested = Array.isArray(params.plan_requested)
    ? params.plan_requested[0]
    : params.plan_requested;
  const planRequested = parsePlanRequested(rawPlanRequested);

  // Build nextPath: if plan_requested is set and no explicit next, route to
  // onboarding so plan_requested survives the auth callback.
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const defaultNext = planRequested
    ? `/onboarding/organization?plan_requested=${planRequested}`
    : "/app";
  const nextPath = safeNextPath(rawNext ?? defaultNext);

  const callbackMessage = getAuthCallbackMessage(reason);
  const pinMessage = reason === "pin-attempts-exceeded"
    ? "Pour protéger votre compte, reconnectez-vous avec votre email."
    : reason === "pin-email-required"
      ? "Reconnectez-vous avec votre email pour continuer sans le verrou PIN."
      : null;

  // UX: when the user comes from a specific plan CTA on the site, acknowledge it
  const planIntro = planRequested && planRequested !== "decouverte" && planRequested !== "sur_mesure"
    ? `Vous avez choisi le plan ${planLabel(planRequested)}. Créez votre compte pour commencer.`
    : null;

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <Link className="wordmark wordmark--auth" href="/">Kjora<span>.</span></Link>
        <p className="eyebrow">Accès sécurisé</p>
        <h1>
          {planRequested === "decouverte"
            ? "Commencez gratuitement."
            : planRequested
              ? `Démarrez avec Kjora ${planLabel(planRequested)}.`
              : "Retrouvez votre espace locatif."}
        </h1>
        {planIntro ? (
          <p className="auth-intro auth-intro--plan">{planIntro}</p>
        ) : (
          <p className="auth-intro">Recevez un lien sécurisé par email. Le code reste disponible comme alternative.</p>
        )}
        {callbackMessage || pinMessage ? (
          <p className="form-feedback form-feedback--error" role="alert">
            {callbackMessage ?? pinMessage}
          </p>
        ) : null}
        <LoginForm nextPath={nextPath} planRequested={planRequested} />
        <p className="auth-footnote">Aucun mot de passe à mémoriser. Le lien de connexion est temporaire et sécurisé.</p>
        <p className="auth-footnote">
          Un problème pour vous connecter ? <Link href="/aide">Consultez l’aide</Link>.
        </p>
        <PublicFooter />
      </section>
    </main>
  );
}
