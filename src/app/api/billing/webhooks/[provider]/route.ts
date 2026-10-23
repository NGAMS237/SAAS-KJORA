import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isProviderName } from "@/core/billing/provider-capabilities";
import { getBillingProvider } from "@/core/billing/provider";
import { isProviderConfigured, isProviderKillSwitched, providerMode } from "@/core/billing/provider-config";
import { decideWebhook, type WebhookContext } from "@/core/billing/webhook-rules";
import { ensureBillingProviders } from "@/core/billing/provider-bootstrap";
import { stripeInvoicePeriod } from "@/core/billing/stripe-webhook-data";
import { isAcceptedStripeWebhookEvent, stripeWebhookHasBusinessEffect } from "@/core/billing/stripe-webhook-events";

// =============================================================================
// KJORA — Réception des webhooks provider (ALIGN-04A)
// =============================================================================
// Contrat de cette route, dans l'ordre où il est appliqué :
//
//  1. Le provider vient du chemin, et doit figurer dans la liste fermée.
//  2. Le corps est lu BRUT, jamais reparsé avant vérification : une signature
//     porte sur des octets, pas sur un objet JSON reconstruit.
//  3. La signature est vérifiée par l'adaptateur. Sans adaptateur enregistré,
//     ou sans secret configuré, la route répond honnêtement qu'elle n'est pas
//     en service — elle ne fait jamais semblant d'accepter.
//  4. L'événement est enregistré par (provider, provider_event_id). L'unicité
//     est une contrainte de base : un rejeu perd la course et devient un
//     doublon reconnu, y compris si deux requêtes arrivent en même temps.
//  5. La décision d'effet est prise par `decideWebhook`, module pur.
//
// Ce que cette route ne fait jamais :
//   • activer un plan sans événement dont la signature est vérifiée ;
//   • croire un montant annoncé par le provider ;
//   • renvoyer au provider autre chose qu'un accusé neutre — pas de détail
//     d'état interne, pas de message d'erreur exploitable.
// =============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Réponse neutre. On accuse réception sans rien révéler. */
function ack(status = 200) {
  return NextResponse.json({ received: true }, { status });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stripeIntentKey(object: Record<string, unknown>): string | null {
  const direct = record(object.metadata).kjora_intent_key;
  const subscriptionDetails = record(object.subscription_details);
  const nested = record(subscriptionDetails.metadata).kjora_intent_key;
  const parentSubscription = record(record(record(object.parent).subscription_details).metadata).kjora_intent_key;
  for (const candidate of [direct, nested, parentSubscription]) {
    if (typeof candidate === "string" && candidate.length >= 16) return candidate;
  }
  return null;
}

function stripeRef(value: unknown, prefix: string): string | null {
  if (typeof value === "string" && value.startsWith(prefix)) return value;
  const id = record(value).id;
  return typeof id === "string" && id.startsWith(prefix) ? id : null;
}

function stripeTimestamp(value: unknown): string | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? new Date(value * 1000).toISOString()
    : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;

  if (!isProviderName(provider)) return ack(404);
  if (!isProviderConfigured(provider)) {
    // Non configuré : on ne prétend pas traiter. 503 invite le provider à
    // rejouer plus tard plutôt qu'à considérer l'événement comme livré.
    return NextResponse.json({ received: false }, { status: 503 });
  }
  if (isProviderKillSwitched(provider)) {
    // REVENUE-01F — coupe-circuit : traité exactement comme "non configuré",
    // délibérément indiscernable de l'extérieur. Un rejeu ultérieur, une fois
    // le coupe-circuit levé, est traité normalement (aucun état n'est perdu :
    // rien n'a été journalisé pendant que le provider était coupé).
    return NextResponse.json({ received: false }, { status: 503 });
  }

  ensureBillingProviders();
  const adapter = getBillingProvider(provider);
  if (!adapter) return NextResponse.json({ received: false }, { status: 503 });

  // --- 2. Corps brut, avant toute interprétation ----------------------------
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });

  // --- 3. Signature --------------------------------------------------------
  const verification = await adapter.verifyWebhook(rawBody, headers);
  if (!verification.valid) {
    // 400 et non 401 : on ne distingue pas les motifs de rejet vers l'extérieur.
    return NextResponse.json({ received: false }, { status: 400 });
  }

  if (provider === "stripe" && !isAcceptedStripeWebhookEvent(verification.eventType)) {
    return ack();
  }
  if (provider === "stripe" && !stripeWebhookHasBusinessEffect(verification.eventType)) {
    return ack();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !secretKey) return NextResponse.json({ received: false }, { status: 503 });

  const supabase = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- 4. Empreinte du corps signé -----------------------------------------
  const digest = createHash("sha256").update(rawBody).digest("hex");

  if (provider === "stripe") {
    const event = verification.payload;
    const object = record(record(event.data).object);
    const intentKey = stripeIntentKey(object);
    const eventCreated = stripeTimestamp(event.created);
    const parentSubscription = record(record(object.parent).subscription_details).subscription;
    const subscriptionRef = stripeRef(object.subscription, "sub_")
      ?? stripeRef(parentSubscription, "sub_")
      ?? stripeRef(object, "sub_");
    const invoiceRef = stripeRef(object.invoice, "in_") ?? stripeRef(object, "in_");
    const statusTransitions = record(object.status_transitions);
    const amountPaid = typeof object.amount_paid === "number" && Number.isSafeInteger(object.amount_paid)
      ? object.amount_paid : null;
    const amountDue = typeof object.amount_due === "number" && Number.isSafeInteger(object.amount_due)
      ? object.amount_due : null;
    const currency = typeof object.currency === "string" ? object.currency.toUpperCase() : null;
    const invoicePeriod = stripeInvoicePeriod(object);
    const { error: processError } = await supabase.rpc("process_stripe_event_v2", {
      p_mode: providerMode(),
      p_provider_event_id: verification.providerEventId,
      p_event_type: verification.eventType,
      p_event_created_at: eventCreated,
      p_intent_key: intentKey,
      p_customer_ref: stripeRef(object.customer, "cus_"),
      p_subscription_ref: subscriptionRef,
      p_payment_status: typeof object.payment_status === "string" ? object.payment_status : null,
      p_payload_digest: digest,
      p_provider_status: typeof object.status === "string" ? object.status : null,
      p_cancel_at_period_end: object.cancel_at_period_end === true,
      p_current_period_end: stripeTimestamp(object.current_period_end),
      p_invoice_ref: invoiceRef,
      p_invoice_amount_minor: verification.eventType === "invoice.paid" ? amountPaid : amountDue,
      p_invoice_currency: currency,
      p_invoice_period_start: invoicePeriod.start,
      p_invoice_period_end: invoicePeriod.end,
      p_invoice_paid_at: stripeTimestamp(statusTransitions.paid_at),
    });
    // La RPC journalise et applique atomiquement. Une erreur annule aussi le
    // journal : le 500 permet alors à Stripe de rejouer sans perte d'événement.
    return ack(processError ? 500 : 200);
  }

  // Les fournisseurs non encore reliés au moteur Stripe conservent le journal
  // générique. L'unicité DB neutralise leurs rejeux concurrents.
  const inserted = await supabase
    .from("billing_webhook_events")
    .insert({
      provider,
      provider_event_id: verification.providerEventId,
      event_type: verification.eventType,
      mode: providerMode(),
      payload_digest: digest,
      signature_verified: true,
      disposition: "acknowledge_unhandled",
    })
    .select("id")
    .single();

  if (inserted.error) {
    if (inserted.error.code === "23505") return ack();
    return NextResponse.json({ received: false }, { status: 500 });
  }

  // --- 5. Décision ---------------------------------------------------------
  // Le contexte métier (intention en attente, montant attendu, Organization)
  // sera résolu par ALIGN-04B, qui rattachera l'événement à son intention.
  // Tant que ce rattachement n'existe pas, aucun événement ne peut activer
  // quoi que ce soit : `pendingPlanExists` est faux, et `decideWebhook`
  // refuse l'activation. C'est le comportement voulu, pas un manque.
  const webhookContext: WebhookContext = {
    alreadyProcessed: false,
    currentStatus: "free",
    pendingPlanExists: false,
    expectedAmountMinor: 0,
    expectedCurrency: "XAF",
    reportedAmountMinor: 0,
    reportedCurrency: "XAF",
    organizationKnown: false,
  };

  const disposition = decideWebhook(verification.eventType, webhookContext);

  await supabase
    .from("billing_webhook_events")
    .update({
      disposition: disposition.action,
      disposition_reason:
        disposition.action === "reject" || disposition.action === "acknowledge_unhandled"
          ? disposition.reason
          : null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", inserted.data.id);

  return ack();
}
