import { isSameOrigin } from "@/core/security/same-origin";
import { NextResponse, type NextRequest } from "next/server";
import { getActiveAuthorization } from "@/core/authorization/server";
import { parseDocumentId, parseStatementRequest } from "@/modules/documents/model";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { mapNotificationRpcError } from "@/modules/notifications/model";

export const runtime = "nodejs";

function sameOrigin(request: Request) {
  return isSameOrigin(request);
}

// Traduit les erreurs Postgres brutes de queue_financial_document_email en
// codes propres pour le client — jamais le texte d'erreur SQL (§12).
function mapQueueEmailError(error: { code?: string; message: string }): string {
  if (error.code === "23514" || error.message.includes("tenant_email_required")) return "tenant_email_required";
  if (error.code === "42501" || error.message.includes("forbidden")) return "forbidden";
  if (error.message.includes("not_found") || error.message.includes("invalid_document")) return "not_found";
  if (error.message.includes("rate_limited") || error.code === "P0004") return "rate_limited";
  return "delivery_preparation_failed";
}

function queueEmailStatus(error: { code?: string; message: string }): number {
  const mapped = mapQueueEmailError(error);
  switch (mapped) {
    case "tenant_email_required": return 409;
    case "forbidden": return 403;
    case "not_found": return 404;
    case "rate_limited": return 429;
    default: return 500;
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const authorization = await getActiveAuthorization();
  if (!authorization) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let input: Record<string, unknown>;
  try { input = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const { applyAuthState, supabase } = createSupabaseRouteHandlerClient(request);

  if (input.action === "prepare_payment_receipt") {
    if (!authorization.capabilities.includes("receipt.view")) return applyAuthState(NextResponse.json({ error: "forbidden" }, { status: 403 }));
    const paymentId = parseDocumentId(input.paymentId);
    if (!paymentId) return applyAuthState(NextResponse.json({ error: "invalid_payment" }, { status: 400 }));
    const result = await supabase.rpc("prepare_payment_receipt", { target_payment_id: paymentId });
    if (result.error) {
      const unavailable = result.error.message.includes("payment_receipt_unavailable");
      return applyAuthState(NextResponse.json({ error: unavailable ? "payment_receipt_unavailable" : "receipt_preparation_failed" }, { status: unavailable ? 409 : 400 }));
    }
    return applyAuthState(NextResponse.json({ documentId: result.data }));
  }

  if (input.action === "prepare_statement") {
    if (!authorization.capabilities.includes("due.view")) return applyAuthState(NextResponse.json({ error: "forbidden" }, { status: 403 }));
    const parsed = parseStatementRequest(input);
    if (!parsed.ok) return applyAuthState(NextResponse.json({ error: parsed.error }, { status: 400 }));
    const result = await supabase.rpc("prepare_account_statement", {
      target_tenant_id: parsed.value.tenantId, period_from: parsed.value.from, period_to: parsed.value.to,
    });
    if (result.error) {
      // NCE-01 : jamais le texte SQL brut, uniquement un code stable.
      const code = result.error.message.includes("invalid_statement_period") ? "invalid_statement_period"
        : result.error.code === "42501" ? "forbidden" : "statement_preparation_failed";
      return applyAuthState(NextResponse.json({ error: code }, { status: code === "forbidden" ? 403 : 400 }));
    }
    return applyAuthState(NextResponse.json({ documentId: result.data }));
  }

  if (input.action === "queue_email") {
    if (!authorization.capabilities.includes("receipt.share")) return applyAuthState(NextResponse.json({ error: "forbidden" }, { status: 403 }));
    const documentId = parseDocumentId(input.documentId);
    if (!documentId) return applyAuthState(NextResponse.json({ error: "invalid_document" }, { status: 400 }));
    // Garde-fou (§9/§12) : ne jamais mettre en file un envoi que le worker
    // cron ne traitera jamais silencieusement (KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED
    // désactivé). Sans cette vérification côté API, une demande resterait
    // "pending" indéfiniment sans jamais être signalée à l'utilisateur.
    if (process.env.KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED !== "true") {
      return applyAuthState(NextResponse.json({ error: "email_delivery_disabled" }, { status: 409 }));
    }
    const result = await supabase.rpc("queue_financial_document_email", { target_document_id: documentId });
    if (result.error) return applyAuthState(NextResponse.json({ error: mapQueueEmailError(result.error) }, { status: queueEmailStatus(result.error) }));
    return applyAuthState(NextResponse.json({ deliveryId: result.data }, { status: 202 }));
  }

  if (input.action === "approve" || input.action === "defer") {
    if (!authorization.capabilities.includes("receipt.share")) return applyAuthState(NextResponse.json({ error: "forbidden" }, { status: 403 }));
    const documentId = parseDocumentId(input.documentId);
    if (!documentId) return applyAuthState(NextResponse.json({ error: "invalid_document" }, { status: 400 }));
    const deferredUntil = typeof input.deferredUntil === "string" ? input.deferredUntil : null;
    const result = await supabase.rpc("review_financial_document", {
      target_document_id: documentId,
      p_decision: input.action,
      p_deferred_until: input.action === "defer" ? deferredUntil : null,
    });
    if (result.error) return applyAuthState(NextResponse.json({ error: "review_failed" }, { status: result.error.code === "42501" ? 403 : 400 }));
    return applyAuthState(NextResponse.json({ result: result.data }));
  }

  if (input.action === "mark_notification_read" || input.action === "mark_notification_unread") {
    const notificationId = parseDocumentId(input.notificationId);
    if (!notificationId) return applyAuthState(NextResponse.json({ error: "invalid_notification" }, { status: 400 }));
    const result = await supabase.rpc("set_notification_read_state", {
      target_notification_id: notificationId,
      target_is_read: input.action === "mark_notification_read",
    });
    if (result.error) return applyAuthState(NextResponse.json({ error: mapNotificationRpcError(result.error) }, { status: 403 }));
    return applyAuthState(NextResponse.json({ notificationId: result.data }));
  }

  if (input.action === "mark_all_notifications_read") {
    if (!authorization.capabilities.includes("activity.view")) return applyAuthState(NextResponse.json({ error: "forbidden" }, { status: 403 }));
    const result = await supabase.rpc("mark_all_notifications_read", {
      target_organization_id: authorization.organizationId,
    });
    if (result.error) return applyAuthState(NextResponse.json({ error: mapNotificationRpcError(result.error) }, { status: 403 }));
    return applyAuthState(NextResponse.json({ updated: Number(result.data ?? 0) }));
  }

  return applyAuthState(NextResponse.json({ error: "unsupported_action" }, { status: 400 }));
}
