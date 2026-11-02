import { isSameOrigin } from "@/core/security/same-origin";
import { NextResponse } from "next/server";
import { requireActiveCapability } from "@/core/authorization/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parsePaymentInput, parsePaymentReversal } from "@/modules/payments/model";

function sameOrigin(request: Request) {
  return isSameOrigin(request);
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function databaseError(error: { code?: string; message?: string } | null) {
  if (!error) return jsonError("server_error", 500);
  const message = error.message ?? "";
  const known = [
    "invalid_payment", "invalid_payment_allocation", "invalid_payment_allocations",
    "payment_allocation_exceeds_due", "payment_allocation_exceeds_payment",
    "payment_allocation_components_do_not_reconcile", "duplicate_payment_allocation",
    "idempotency_key_conflict", "payment_not_reversible", "payment_reversal_reason_required",
  ].find((value) => message.includes(value));
  if (error.code === "42501") return jsonError("forbidden", 403);
  if (known) return jsonError(known, error.code === "23505" ? 409 : 400);
  if (["22023", "22P02", "23503", "23505", "23514"].includes(error.code ?? "")) return jsonError("business_rule_rejected", 409);
  return jsonError("server_error", 500);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("forbidden", 403);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || (body.action !== "confirm" && body.action !== "reverse")) return jsonError("invalid_payload", 400);
  const capability = body.action === "confirm" ? "payment.record" : "payment.correct";
  const access = await requireActiveCapability(capability);
  if (!access.authorization) return jsonError(access.status === 401 ? "unauthenticated" : "forbidden", access.status);
  const supabase = await createSupabaseServerClient();

  if (body.action === "reverse") {
    const parsed = parsePaymentReversal(body);
    if (!parsed.ok) return jsonError(parsed.error, 400);
    const { data, error } = await supabase.rpc("reverse_payment", {
      target_payment_id: parsed.value.paymentId,
      target_reason: parsed.value.reason,
    }).single();
    if (error || !data) return databaseError(error);
    const reversed = data as { payment_id: string; payment_status: string };
    return NextResponse.json({ paymentId: reversed.payment_id, status: reversed.payment_status });
  }

  const parsed = parsePaymentInput(body);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  const payment = parsed.value;
  const { data, error } = await supabase.rpc("confirm_payment", {
    target_lease_id: payment.leaseId,
    target_amount_xaf: payment.amountXaf,
    target_payment_date: payment.paymentDate,
    target_method: payment.method,
    target_external_reference: payment.externalReference,
    target_note: payment.note,
    target_idempotency_key: payment.idempotencyKey,
    target_allocations: payment.allocations?.map((allocation) => ({
      due_id: allocation.dueId, amount_xaf: allocation.amountXaf,
    })) ?? null,
  }).single();
  if (error || !data) return databaseError(error);
  const confirmed = data as {
    payment_id: string; payment_reference: string; allocated_amount_xaf: number | string;
    credit_created_xaf: number | string; balance_before_xaf: number | string;
    balance_after_xaf: number | string; payment_status: string;
  };
  return NextResponse.json({
    paymentId: confirmed.payment_id,
    paymentReference: confirmed.payment_reference,
    allocatedAmountXaf: Number(confirmed.allocated_amount_xaf),
    creditCreatedXaf: Number(confirmed.credit_created_xaf),
    balanceBeforeXaf: Number(confirmed.balance_before_xaf),
    balanceAfterXaf: Number(confirmed.balance_after_xaf),
    status: confirmed.payment_status,
  }, { status: 201 });
}
