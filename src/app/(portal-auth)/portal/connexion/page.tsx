import Link from "next/link";
import { safeNextPath } from "@/core/auth/safe-next-path";
import { PortalLoginForm } from "@/tenant-portal/login-form";

export default async function PortalLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reason?: string; lang?: string }> }) {
  const params = await searchParams;
  const language = params.lang === "en" ? "en" : "fr";
  const t = (fr: string, en: string) => language === "en" ? en : fr;
  const nextPath = safeNextPath(params.next, undefined).startsWith("/portal") ? safeNextPath(params.next) : "/portal/auth/complete";
  return <main className="auth-page"><section className="auth-panel"><Link className="wordmark wordmark--auth" href="/">Kjora<span>.</span></Link><p className="eyebrow">{t("Espace locataire sécurisé", "Secure tenant space")}</p><h1>{t("Accédez à votre location.", "Access your lease.")}</h1><p className="auth-intro">{t("Utilisez l’adresse email invitée. Aucun PIN ni mot de passe n’est demandé.", "Use the invited email address. No PIN or password is required.")}</p>{params.reason ? <p className="form-feedback form-feedback--error" role="alert">{params.reason === "portal-access-required" ? t("Une invitation active est nécessaire pour accéder au portail.", "An active invitation is required to access the portal.") : t("La session portail doit être vérifiée à nouveau.", "The portal session must be verified again.")}</p> : null}<PortalLoginForm language={language} nextPath={nextPath} /><p className="auth-footnote">{t("Une connexion réussie ne crée aucun Membership interne et ne donne accès qu’aux locations explicitement autorisées.", "A successful sign-in creates no internal Membership and only grants access to explicitly authorized leases.")}</p></section></main>;
}
