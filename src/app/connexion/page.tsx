import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/core/auth/login-form";
import { getAuthCallbackMessage } from "@/core/auth/callback-diagnostics";
import { safeNextPath } from "@/core/auth/safe-next-path";
import { appendSiteAppIntent, parseSiteAppIntent, planLabel, type SiteAppSearchParams } from "@/core/onboarding/plan-intent";
import { PublicFooter } from "@/core/ui/public-footer";
import { destinationFor, resolveUserContext } from "@/core/routing/context-resolver";

export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

// ALIGN-02: plan_requested comes from the marketing site CTA.
// It is non-trustworthy — validated here only for UX messaging.
// Never used to assign a plan or grant entitlements.
type LoginPageProps = {
  searchParams: Promise<{
    reason?: string | string[];
    next?: string | string[];
    plan?: string | string[];
    plan_requested?: string | string[];
    billing_cycle?: string | string[];
    billing_country?: string | string[];
    locale?: string | string[];
    source?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const reason = Array.isArray(params.reason) ? params.reason[0] : params.reason;
  const intent = parseSiteAppIntent(params as SiteAppSearchParams);
  const planRequested = intent.plan;

  // Build nextPath: if plan_requested is set and no explicit next, route to
  // onboarding so plan_requested survives the auth callback.
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const defaultNext = planRequested
    ? appendSiteAppIntent("/onboarding/organization", intent)
    : "/app";
  const nextPath = safeNextPath(rawNext ?? defaultNext);

  // Reuse a valid session instead of asking for another magic link. The
  // destination still comes from server-side context resolution; URL role,
  // Organization and entitlement hints never participate in that decision.
  const context = await resolveUserContext();
  if (context.kind !== "unauthenticated") {
    if (rawNext) redirect(safeNextPath(rawNext));
    const destination = destinationFor(context);
    redirect(planRequested && destination === "/onboarding/organization"
      ? appendSiteAppIntent(destination, intent)
      : destination);
  }

  const english = intent.locale === "en";
  const t = (fr: string, en: string) => english ? en : fr;
  const callbackMessage = getAuthCallbackMessage(reason, intent.locale);
  const pinMessage = reason === "pin-attempts-exceeded"
    ? t("Pour protéger votre compte, reconnectez-vous avec votre email.", "To protect your account, sign in again with your email.")
    : reason === "pin-email-required"
      ? t("Reconnectez-vous avec votre email pour continuer sans le verrou PIN.", "Sign in again with your email to continue without the PIN lock.")
      : null;

  // UX: when the user comes from a specific plan CTA on the site, acknowledge it
  const planIntro = planRequested && planRequested !== "decouverte" && planRequested !== "sur_mesure"
    ? t(
      `Vous avez choisi le plan ${planLabel(planRequested)}. Créez votre compte pour commencer.`,
      `You selected the ${planLabel(planRequested, "en")} plan. Create your account to get started.`,
    )
    : null;

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <Link className="wordmark wordmark--auth" href="/">Kjora<span>.</span></Link>
        <p className="eyebrow">{t("Accès sécurisé", "Secure access")}</p>
        <h1>
          {planRequested === "decouverte"
            ? t("Commencez gratuitement.", "Start for free.")
            : planRequested
              ? t(`Démarrez avec Kjora ${planLabel(planRequested)}.`, `Get started with Kjora ${planLabel(planRequested, "en")}.`)
              : t("Retrouvez votre espace KJORA.", "Access your KJORA workspace.")}
        </h1>
        {planIntro ? (
          <p className="auth-intro auth-intro--plan">{planIntro}</p>
        ) : (
          <p className="auth-intro">{t("Recevez un lien sécurisé par email pour accéder à votre espace. Le code reste disponible comme alternative.", "Receive a secure email link to continue. You can also use the one-time code.")}</p>
        )}
        {callbackMessage || pinMessage ? (
          <p className="form-feedback form-feedback--error" role="alert">
            {callbackMessage ?? pinMessage}
          </p>
        ) : null}
        <LoginForm nextPath={nextPath} planRequested={planRequested} locale={intent.locale} />
        <p className="auth-footnote">{t("Aucun mot de passe à mémoriser. Le lien de connexion est temporaire et sécurisé.", "No password to remember. The sign-in link is temporary and secure.")}</p>
        <p className="auth-footnote">
          {t("Un problème pour vous connecter ? ", "Having trouble signing in? ")}<Link href="/aide">{t("Consultez l’aide", "View help")}</Link>.
        </p>
        <PublicFooter />
      </section>
    </main>
  );
}
