import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isInternalRole } from "@/core/authorization/capabilities";
import { MEMBERSHIP_INVITATION_COOKIE } from "@/core/team/invitation-cookie";
import { InvitationAcceptance } from "@/core/team/invitation-acceptance";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AcceptInvitationPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(MEMBERSHIP_INVITATION_COOKIE)?.value;
  if (!token) return <InvalidInvitation />;
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claimsData?.claims?.sub !== "string") {
    redirect("/connexion?next=%2Finvitation%2Faccepter");
  }
  const { data, error } = await supabase.rpc("inspect_membership_invitation", { invitation_token: token });
  const invitation = data?.[0] as { organization_name?: string; invited_role?: string } | undefined;
  if (error || !invitation?.organization_name || !invitation.invited_role || !isInternalRole(invitation.invited_role)) {
    return <InvalidInvitation />;
  }
  return <main className="auth-page"><section className="auth-panel">
    <Link className="wordmark wordmark--auth" href="/">Kjora<span>.</span></Link>
    <InvitationAcceptance organizationName={invitation.organization_name} role={invitation.invited_role} />
  </section></main>;
}

function InvalidInvitation() {
  return <main className="auth-page"><section className="auth-panel">
    <Link className="wordmark wordmark--auth" href="/">Kjora<span>.</span></Link>
    <p className="eyebrow">Invitation</p><h1>Invitation indisponible.</h1>
    <p>Elle a peut-être expiré, déjà été utilisée ou révoquée.</p>
    <Link className="button button--primary" href="/connexion">Se connecter</Link>
  </section></main>;
}
