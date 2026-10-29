import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/core/http/same-origin";
import { requireActiveCapability } from "@/core/authorization/server";
import { isBillingCycle } from "@/core/billing/model";
import { getBillingProvider } from "@/core/billing/provider";
import { ensureBillingProviders } from "@/core/billing/provider-bootstrap";
import { isProviderConfigured, isProviderKillSwitched, stripeEnvironment } from "@/core/billing/provider-config";
import { requestPlanChange } from "@/core/billing/server";
import { stripePrice } from "@/core/billing/stripe-price-map";
import { isPlanSlug } from "@/core/entitlements/model";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CheckoutSession } from "@/core/billing/provider";

export const runtime = "nodejs";

const SAFE_STRIPE_ERRORS = new Set([
  "STRIPE_KEY_REQUIRED",
  "STRIPE_TEST_PRICE_REQUIRED",
  "STRIPE_SESSION_REJECTED",
  "STRIPE_TEST_CAD_ONLY",
  "STRIPE_ENVIRONMENT_KEY_MISMATCH",
  "STRIPE_SESSION_MODE_MISMATCH",
]);

function checkoutProviderError(error: unknown) {
  const code = error instanceof Error && SAFE_STRIPE_ERRORS.has(error.message) ? error.message : null;
  if (code === "STRIPE_ENVIRONMENT_KEY_MISMATCH" || code === "STRIPE_SESSION_MODE_MISMATCH") {
    return "stripe_environment_mismatch";
  }
  if (code) return "stripe_provider_rejected";
  return "stripe_provider_error";
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { authorization, status } = await requireActiveCapability("billing.manage");
  if (!authorization) return NextResponse.json({ error: "forbidden" }, { status });
  if (!isProviderConfigured("stripe") || isProviderKillSwitched("stripe")) {
    return NextResponse.json({ error: "stripe_test_unavailable" }, { status: 503 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.plan !== "string" || !isPlanSlug(body.plan)
    || typeof body.cycle !== "string" || !isBillingCycle(body.cycle)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const environment = stripeEnvironment();
  if (!environment) return NextResponse.json({ error: "stripe_unavailable" }, { status: 503 });
  const priceRef = stripePrice(environment, body.plan, body.cycle);
  if (!priceRef) return NextResponse.json({ error: "stripe_test_price_unavailable" }, { status: 503 });
  const prepared = await requestPlanChange(authorization.organizationId, body.plan, body.cycle, "CA");
  if (prepared?.outcome === "billing_market_change_blocked") {
    return NextResponse.json({ error: "billing_market_change_blocked" }, { status: 409 });
  }
  if (!prepared || !["upgrade_intent_recorded", "unchanged"].includes(String(prepared.outcome))) {
    return NextResponse.json({ error: "checkout_not_prepared" }, { status: 409 });
  }
  const clientKey = typeof body.idempotency_key === "string" && /^[a-f0-9-]{36}$/i.test(body.idempotency_key)
    ? body.idempotency_key : randomUUID();
  const idempotencyKey = `kjora:${authorization.organizationId}:${clientKey}`;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("prepare_stripe_checkout", {
    target_organization_id: authorization.organizationId,
    p_plan: body.plan, p_cycle: body.cycle, p_price_ref: priceRef,
    p_idempotency_key: idempotencyKey,
    p_mode: environment === "live" ? "live" : "sandbox",
  });
  if (error || !data) return NextResponse.json({ error: "checkout_not_prepared" }, { status: 409 });
  const intent = data as Record<string, unknown>;
  ensureBillingProviders();
  const adapter = getBillingProvider("stripe");
  if (!adapter) return NextResponse.json({ error: "stripe_test_unavailable" }, { status: 503 });
  let session: CheckoutSession;
  try {
    session = await adapter.createCheckout({
      organizationId: authorization.organizationId, plan: body.plan, cycle: body.cycle,
      currency: "CAD", amountMinor: Number(intent.amountMinor), method: "card",
      idempotencyKey, returnPath: "/app/billing", providerPriceRef: priceRef,
      providerCustomerRef: typeof intent.customerRef === "string" ? intent.customerRef : null,
      locale: body.locale === "en" ? "en" : "fr",
    });
  } catch (error) {
    const providerError = checkoutProviderError(error);
    console.error("billing.stripe.checkout_failed", {
      organizationId: authorization.organizationId,
      code: providerError,
    });
    return NextResponse.json({ error: providerError }, { status: 502 });
  }
  const attached = await supabase.rpc("attach_stripe_checkout", {
    target_intent_id: intent.intentId, p_checkout_session_ref: session.providerSessionRef,
  });
  if (attached.error || attached.data !== true) return NextResponse.json({ error: "checkout_not_recorded" }, { status: 500 });
  return NextResponse.json({ redirect_url: session.redirectUrl });
}
