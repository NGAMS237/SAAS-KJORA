import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/core/http/same-origin";
import { getActiveAuthorization } from "@/core/authorization/server";
import { isBillingCycle } from "@/core/billing/model";
import { isPlanSlug } from "@/core/entitlements/model";
import { isBillingCountry } from "@/core/onboarding/plan-intent";
import {
  requestPlanChange,
  cancelSubscription,
  resumeSubscription,
  requestReactivation,
} from "@/core/billing/server";

// =============================================================================
// API Billing SaaS (ALIGN-03)
// =============================================================================
// • L'Organization vient du contexte serveur, jamais du corps de requête.
// • Le client n'envoie aucun montant : les devis sont calculés en base.
// • Aucune action n'active un plan payant : l'activation exige un paiement
//   vérifié, qui appartient à ALIGN-04.
// =============================================================================

const ACTIONS = ["change_plan", "cancel", "resume", "reactivate"] as const;
type Action = (typeof ACTIONS)[number];

function isAction(value: unknown): value is Action {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const authorization = await getActiveAuthorization();
  if (!authorization) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  // La facturation relève de l'Organization Owner.
  if (!authorization.capabilities.includes("billing.manage")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isAction(body.action)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const organizationId = authorization.organizationId;

  if (body.action === "change_plan") {
    if (typeof body.plan !== "string" || !isPlanSlug(body.plan) || !isBillingCycle(body.cycle)
      || !isBillingCountry(body.billing_country)) {
      return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
    }
    const result = await requestPlanChange(organizationId, body.plan, body.cycle, body.billing_country);
    if (!result) return NextResponse.json({ error: "plan_change_failed" }, { status: 400 });
    return NextResponse.json({ result });
  }

  const run = body.action === "cancel"
    ? cancelSubscription
    : body.action === "resume"
      ? resumeSubscription
      : requestReactivation;

  const result = await run(organizationId);
  if (!result) return NextResponse.json({ error: "billing_action_failed" }, { status: 400 });
  return NextResponse.json({ result });
}
