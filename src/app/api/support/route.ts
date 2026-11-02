import { isSameOrigin } from "@/core/security/same-origin";
import { checkRateLimit, clientKey } from "@/core/security/rate-limit";
import { NextResponse } from "next/server";
import { getActiveAuthorization } from "@/core/authorization/server";
import { loadAnyMembershipOrganization } from "@/core/organization/load-organization-context";
import { isSupportCategory, isValidSupportMessage } from "@/core/support/model";
import { isSupportEmailConfigured, sendSupportRequestEmail } from "@/core/support/support-email";

// =============================================================================
// API Support — bêta Découverte
// =============================================================================
// • Exige une session authentifiée et une appartenance active à une Organization.
// • L'Organization transmise est celle résolue côté serveur : le client ne peut
//   pas déclarer une organisation à laquelle il n'appartient pas.
// • Aucune persistance : la demande part par email.
//
// REVENUE-LAUNCH-01 — Complément (§5) : résolution DÉLIBÉRÉMENT indépendante du
// statut de l'Organization (loadAnyMembershipOrganization, jamais
// loadOrganizationContext ici) — le mandat exige que l'aide/support reste
// accessible à une Organization suspendue ou archivée, précisément le cas où
// l'utilisateur en a le plus besoin. Aucune capacité métier n'est requise pour
// envoyer une demande de support ; seule l'appartenance (active) compte.
// =============================================================================

function sameOrigin(request: Request) {
  return isSameOrigin(request);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const authorization = await getActiveAuthorization();
  if (!authorization) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  {
    const limit = checkRateLimit(clientKey(request, "support", authorization.userId), 5, 600000);
    if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isSupportCategory(body.category) || typeof body.message !== "string") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  if (!isValidSupportMessage(body.message)) {
    return NextResponse.json({ error: "invalid_message" }, { status: 400 });
  }
  const message = body.message.trim();

  if (!isSupportEmailConfigured()) {
    return NextResponse.json({ error: "support_email_not_configured" }, { status: 503 });
  }

  // L'organisation et le rôle proviennent du contexte serveur, jamais du client.
  const requestedOrganizationId = typeof body.organizationId === "string" ? body.organizationId : null;
  const context = await loadAnyMembershipOrganization(requestedOrganizationId);
  const active = context.organization;
  if (!active) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const replyTo = context.user.email;
  if (!replyTo) {
    return NextResponse.json({ error: "missing_contact_email" }, { status: 400 });
  }

  const sent = await sendSupportRequestEmail({
    category: body.category,
    message,
    replyTo,
    organizationName: active.name,
    organizationId: active.id,
    role: active.role,
  });

  if (!sent) {
    return NextResponse.json({ error: "support_delivery_failed" }, { status: 502 });
  }

  return NextResponse.json({ received: true, replyTo }, { status: 201 });
}
