import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/core/http/same-origin";
import { requireActiveCapability } from "@/core/authorization/server";
import { getBillingProvider } from "@/core/billing/provider";
import { ensureBillingProviders } from "@/core/billing/provider-bootstrap";
import { isProviderConfigured, isProviderKillSwitched } from "@/core/billing/provider-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { authorization, status } = await requireActiveCapability("billing.manage");
  if (!authorization) return NextResponse.json({ error: "forbidden" }, { status });
  if (!isProviderConfigured("stripe") || isProviderKillSwitched("stripe")) {
    return NextResponse.json({ error: "stripe_test_unavailable" }, { status: 503 });
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("organization_subscriptions")
    .select("provider,provider_customer_ref").eq("organization_id", authorization.organizationId).maybeSingle();
  if (data?.provider !== "stripe" || typeof data.provider_customer_ref !== "string") {
    return NextResponse.json({ error: "stripe_customer_unavailable" }, { status: 409 });
  }
  ensureBillingProviders();
  const adapter = getBillingProvider("stripe");
  if (!adapter?.openCustomerPortal) return NextResponse.json({ error: "stripe_test_unavailable" }, { status: 503 });
  const session = await adapter.openCustomerPortal({
    organizationId: authorization.organizationId,
    providerCustomerRef: data.provider_customer_ref,
    returnPath: "/app/billing",
    idempotencyKey: randomUUID(),
  });
  return NextResponse.json({ redirect_url: session.redirectUrl });
}
