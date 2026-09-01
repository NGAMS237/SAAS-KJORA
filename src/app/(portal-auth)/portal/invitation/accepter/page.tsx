import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TENANT_PORTAL_INVITATION_COOKIE } from "@/tenant-portal/invitation-cookie";
import { PortalInvitationAcceptance } from "@/tenant-portal/invitation-acceptance";

export default async function AcceptPortalInvitationPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const requestedLanguage = (await searchParams).lang === "en" ? "en" : "fr";
  const token = (await cookies()).get(TENANT_PORTAL_INVITATION_COOKIE)?.value;
  if (!token) return <Invalid />;
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") redirect(`/portal/connexion?next=${encodeURIComponent(`/portal/invitation/accepter?lang=${requestedLanguage}`)}&lang=${requestedLanguage}`);
  const { data, error } = await supabase.rpc("inspect_tenant_portal_invitation", { invitation_token: token });
  const invitation = data?.[0] as { organization_name?: string; tenant_name?: string; preferred_language?: string } | undefined;
  if (error || !invitation?.organization_name || !invitation.tenant_name) return <Invalid />;
  return <main className="auth-page"><section className="auth-panel"><Link className="wordmark wordmark--auth" href="/">Kjora<span>.</span></Link><PortalInvitationAcceptance language={invitation.preferred_language === "en" ? "en" : "fr"} organizationName={invitation.organization_name} tenantName={invitation.tenant_name} /></section></main>;
}

function Invalid() { return <main className="auth-page"><section className="auth-panel"><Link className="wordmark wordmark--auth" href="/">Kjora<span>.</span></Link><p className="eyebrow">Invitation</p><h1>Invitation indisponible.</h1><p>Elle a peut-être expiré, déjà été utilisée, révoquée ou ouverte avec une autre adresse email.</p><Link className="button button--primary" href="/portal/connexion">Se connecter</Link></section></main>; }
