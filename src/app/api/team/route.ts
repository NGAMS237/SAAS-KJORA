import { isSameOrigin } from "@/core/security/same-origin";
import { NextResponse } from "next/server";
import { isInternalRole } from "@/core/authorization/capabilities";
import { requireActiveCapability } from "@/core/authorization/server";
import {
  isTransactionalEmailConfigured,
  sendMembershipInvitationEmail,
} from "@/core/team/invitation-email";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseEntitlementError, entitlementErrorResponse } from "@/core/entitlements/server";

type TeamAction =
  | "invite"
  | "resend_invitation"
  | "revoke_invitation"
  | "change_role"
  | "revoke_member"
  | "transfer_owner";

function sameOrigin(request: Request) {
  return isSameOrigin(request);
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("forbidden", 403);
  const access = await requireActiveCapability("member.manage");
  if (!access.authorization) return jsonError(access.status === 401 ? "unauthenticated" : "forbidden", access.status);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action as TeamAction | undefined;
  const supabase = await createSupabaseServerClient();
  const organizationId = access.authorization.organizationId;

  if (action === "invite") {
    if (!isTransactionalEmailConfigured()) return jsonError("email_configuration_required", 503);
    if (typeof body?.email !== "string" || typeof body.role !== "string" || !isInternalRole(body.role)) {
      return jsonError("invalid_payload", 400);
    }
    const { data: profile, error: profileError } = await supabase
      .from("organization_profiles")
      .select("name, language")
      .eq("organization_id", organizationId)
      .single();
    if (profileError || !profile) return jsonError("organization_unavailable", 400);
    const { data, error } = await supabase.rpc("create_membership_invitation", {
      target_organization_id: organizationId,
      invited_email: body.email,
      invited_role: body.role,
    });
    const invitation = data?.[0] as { invitation_id?: string; invitation_token?: string } | undefined;
    if (error?.code === "P0001") {
      // ALIGN-01 quota trigger (max_collaborators, e.g. Découverte = 0) —
      // surface as a structured entitlement error, not a generic rejection.
      const entitlementErr = parseEntitlementError(error.message ?? "", error.details ?? undefined);
      if (entitlementErr) return entitlementErrorResponse(entitlementErr);
    }
    if (error || !invitation?.invitation_id || !invitation.invitation_token) return jsonError("invitation_rejected", 400);
    const invitationUrl = new URL("/invitation", request.url);
    invitationUrl.searchParams.set("token", invitation.invitation_token);
    const sent = await sendMembershipInvitationEmail({
      email: body.email.trim().toLowerCase(),
      invitationUrl: invitationUrl.toString(),
      language: profile.language === "en" ? "en" : "fr",
      organizationName: profile.name,
      role: body.role,
    });
    if (!sent) {
      await supabase.rpc("revoke_membership_invitation", { target_invitation_id: invitation.invitation_id });
      return jsonError("email_delivery_failed", 502);
    }
    return NextResponse.json({ invitationId: invitation.invitation_id }, { status: 201 });
  }

  if (action === "resend_invitation") {
    if (!isTransactionalEmailConfigured()) return jsonError("email_configuration_required", 503);
    if (typeof body?.invitationId !== "string") return jsonError("invalid_payload", 400);
    const { data: profile, error: profileError } = await supabase
      .from("organization_profiles")
      .select("name, language")
      .eq("organization_id", organizationId)
      .single();
    const { data, error } = await supabase.rpc("resend_membership_invitation", {
      target_invitation_id: body.invitationId,
    });
    const invitation = data?.[0] as {
      invitation_id?: string;
      invitation_email?: string;
      invitation_role?: string;
      invitation_token?: string;
    } | undefined;
    if (
      profileError || !profile || error || !invitation?.invitation_id ||
      !invitation.invitation_email || !invitation.invitation_token ||
      !invitation.invitation_role || !isInternalRole(invitation.invitation_role)
    ) {
      return jsonError("invitation_rejected", 400);
    }
    const invitationUrl = new URL("/invitation", request.url);
    invitationUrl.searchParams.set("token", invitation.invitation_token);
    const sent = await sendMembershipInvitationEmail({
      email: invitation.invitation_email,
      invitationUrl: invitationUrl.toString(),
      language: profile.language === "en" ? "en" : "fr",
      organizationName: profile.name,
      role: invitation.invitation_role,
    });
    if (!sent) {
      await supabase.rpc("revoke_membership_invitation", { target_invitation_id: invitation.invitation_id });
      return jsonError("email_delivery_failed", 502);
    }
    return NextResponse.json({ invitationId: invitation.invitation_id });
  }

  if (action === "revoke_invitation" && typeof body?.invitationId === "string") {
    const { error } = await supabase.rpc("revoke_membership_invitation", { target_invitation_id: body.invitationId });
    return error ? jsonError("invitation_rejected", 400) : NextResponse.json({ ok: true });
  }

  if (action === "change_role" && typeof body?.membershipId === "string" && typeof body.role === "string" && isInternalRole(body.role)) {
    const { error } = await supabase.rpc("change_membership_role", {
      target_organization_id: organizationId,
      target_membership_id: body.membershipId,
      new_role: body.role,
    });
    return error ? jsonError("role_change_rejected", 400) : NextResponse.json({ ok: true });
  }

  if (action === "revoke_member" && typeof body?.membershipId === "string") {
    const { error } = await supabase.rpc("revoke_membership", {
      target_organization_id: organizationId,
      target_membership_id: body.membershipId,
    });
    return error ? jsonError("member_revocation_rejected", 400) : NextResponse.json({ ok: true });
  }

  if (action === "transfer_owner" && typeof body?.membershipId === "string") {
    const { error } = await supabase.rpc("transfer_organization_ownership", {
      target_organization_id: organizationId,
      target_membership_id: body.membershipId,
    });
    return error ? jsonError("owner_transfer_rejected", 400) : NextResponse.json({ ok: true });
  }

  return jsonError("invalid_action", 400);
}
