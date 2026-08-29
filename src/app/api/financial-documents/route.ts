import { NextResponse, type NextRequest } from "next/server";
import { getActiveAuthorization } from "@/core/authorization/server";
import { parseDocumentId, parseStatementRequest } from "@/modules/documents/model";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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
    if (result.error) return applyAuthState(NextResponse.json({ error: result.error.message }, { status: 400 }));
    return applyAuthState(NextResponse.json({ documentId: result.data }));
  }

  if (input.action === "queue_email") {
    if (!authorization.capabilities.includes("receipt.share")) return applyAuthState(NextResponse.json({ error: "forbidden" }, { status: 403 }));
    const documentId = parseDocumentId(input.documentId);
    if (!documentId) return applyAuthState(NextResponse.json({ error: "invalid_document" }, { status: 400 }));
    const result = await supabase.rpc("queue_financial_document_email", { target_document_id: documentId });
    if (result.error) return applyAuthState(NextResponse.json({ error: result.error.message }, { status: 400 }));
    return applyAuthState(NextResponse.json({ deliveryId: result.data }, { status: 202 }));
  }

  if (input.action === "mark_notification_read") {
    const notificationId = parseDocumentId(input.notificationId);
    if (!notificationId) return applyAuthState(NextResponse.json({ error: "invalid_notification" }, { status: 400 }));
    const result = await supabase.rpc("mark_notification_read", { target_notification_id: notificationId });
    if (result.error) return applyAuthState(NextResponse.json({ error: result.error.message }, { status: 403 }));
    return applyAuthState(NextResponse.json({ notificationId: result.data }));
  }

  return applyAuthState(NextResponse.json({ error: "unsupported_action" }, { status: 400 }));
}
