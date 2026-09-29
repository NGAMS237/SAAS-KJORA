import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/core/auth/safe-next-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PortalLoginForm } from "@/tenant-portal/login-form";

export default async function PortalLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reason?: string; lang?: string }> }) {
  const params = await searchParams;
  const language = params.lang === "en" ? "en" : "fr";
  const t = (fr: string, en: string) => language === "en" ? en : fr;
  const nextPath = safeNextPath(params.next, undefined).startsWith("/portal") ? safeNextPath(params.next) : "/portal/auth/complete";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (!error && data?.claims?.sub) redirect(nextPath);
  return <main className="auth-page"><section className="auth-panel"><Link className="wordmark wordmark--auth" href="/">Kjora<span>.</span></Link><p className="eyebrow">{t("Espace locataire sécurisé", "Secure tenant space")}</p><h1>{t("Accédez à votre location.", "Access your lease.")}</h1><p className="auth-intro">{t("Votre accès reste actif. Pour votre sécurité, KJORA peut parfois vous demander de vous reconnecter.", "Your access remains active. For security, KJORA may occasionally ask you to sign in again.")}</p>{params.reason ? <p className="form-feedback form-feedback--error" role="alert">{params.reason === "portal-access-required" ? t("Cet accès portail n’est pas actif ou n’est plus autorisé.", "This portal access is not active or is no longer authorized.") : params.reason === "organization-unavailable" ? t("L’espace de votre bailleur est temporairement indisponible. Vos informations sont conservées ; contactez directement votre bailleur pour toute demande.", "Your landlord’s space is temporarily unavailable. Your information is kept; contact your landlord directly for any request.") : t("La session portail doit être vérifiée à nouveau avec votre email.", "The portal session must be verified again with your email.")}</p> : null}<PortalLoginForm language={language} nextPath={nextPath} /><p className="auth-footnote">{t("Une connexion réussie ne crée aucun Membership interne et ne donne accès qu’aux locations explicitement autorisées.", "A successful sign-in creates no internal Membership and only grants access to explicitly authorized leases.")}</p></section></main>;
}
