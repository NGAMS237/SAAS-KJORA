import { isSameOrigin } from "@/core/security/same-origin";
import { NextResponse } from "next/server";
import { requireActiveCapability } from "@/core/authorization/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendTenantPortalInvitationEmail } from "@/tenant-portal/invitation-email";

function sameOrigin(request: Request) {
  return isSameOrigin(request);
}
function error(code: string, status: number) { return NextResponse.json({ error: code }, { status }); }

export async function POST(request: Request) {
  if (!sameOrigin(request)) return error("forbidden", 403);
  const access = await requireActiveCapability("tenant_portal.manage");
  if (!access.authorization) return error(access.status === 401 ? "unauthenticated" : "forbidden", access.status);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const supabase = await createSupabaseServerClient();
  const profile = await supabase.from("organization_profiles").select("name, language")
    .eq("organization_id", access.authorization.organizationId).single();
  if (profile.error || !profile.data) return error("organization_unavailable", 400);

  if (body?.action === "invite" && typeof body.tenantId === "string" && Array.isArray(body.leaseIds)) {
    const result = await supabase.rpc("create_tenant_portal_invitation", {
      target_tenant_id: body.tenantId, target_lease_ids: body.leaseIds.filter((value): value is string => typeof value === "string"),
    });
    const invitation = result.data?.[0] as { access_id?: string; invitation_id?: string; invitation_email?: string; invitation_language?: string; invitation_token?: string } | undefined;
    if (result.error || !invitation?.access_id || !invitation.invitation_id || !invitation.invitation_email || !invitation.invitation_token) return error("invitation_rejected", 400);
    const invitationUrl = new URL("/portal/invitation", request.url); invitationUrl.searchParams.set("token", invitation.invitation_token); invitationUrl.searchParams.set("lang", invitation.invitation_language === "en" ? "en" : "fr");
    const sent = await sendTenantPortalInvitationEmail({ email: invitation.invitation_email, invitationUrl: invitationUrl.toString(), language: invitation.invitation_language === "en" ? "en" : "fr", organizationName: profile.data.name });
    if (!sent) { await supabase.rpc("revoke_tenant_portal_access", { target_access_id: invitation.access_id }); return error("email_delivery_failed", 502); }
    return NextResponse.json({ accessId: invitation.access_id }, { status: 201 });
  }

  if (body?.action === "resend" && typeof body.accessId === "string") {
    const result = await supabase.rpc("resend_tenant_portal_invitation", { target_access_id: body.accessId });
    const invitation = result.data?.[0] as { access_id?: string; invitation_email?: string; invitation_language?: string; invitation_token?: string } | undefined;
    if (result.error || !invitation?.access_id || !invitation.invitation_email || !invitation.invitation_token) return error("invitation_rejected", 400);
    const invitationUrl = new URL("/portal/invitation", request.url); invitationUrl.searchParams.set("token", invitation.invitation_token); invitationUrl.searchParams.set("lang", invitation.invitation_language === "en" ? "en" : "fr");
    const sent = await sendTenantPortalInvitationEmail({ email: invitation.invitation_email, invitationUrl: invitationUrl.toString(), language: invitation.invitation_language === "en" ? "en" : "fr", organizationName: profile.data.name });
    if (!sent) { await supabase.rpc("revoke_tenant_portal_access", { target_access_id: invitation.access_id }); return error("email_delivery_failed", 502); }
    return NextResponse.json({ accessId: invitation.access_id });
  }

  if (body?.action === "revoke" && typeof body.accessId === "string") {
    const result = await supabase.rpc("revoke_tenant_portal_access", { target_access_id: body.accessId });
    return result.error ? error("revocation_rejected", 400) : NextResponse.json({ ok: true });
  }
  return error("invalid_action", 400);
}
