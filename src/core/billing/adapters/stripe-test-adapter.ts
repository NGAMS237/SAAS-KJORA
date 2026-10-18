import "server-only";

import Stripe from "stripe";
import type {
  BillingProviderAdapter,
  CheckoutRequest,
  CheckoutSession,
  CustomerPortalRequest,
  CustomerPortalSession,
  WebhookVerification,
} from "../provider";
import { stripeReturnUrl } from "../stripe-test-safety";
import type { ProviderMode } from "../provider";

export type StripeTestGateway = {
  checkout(request: CheckoutRequest, secret: string): Promise<CheckoutSession>;
  portal(request: CustomerPortalRequest, secret: string): Promise<CustomerPortalSession>;
  verify(rawBody: string, signature: string, webhookSecret: string): Stripe.Event;
};

function absoluteReturnUrl(path: string): string {
  return stripeReturnUrl(process.env.KJORA_APP_ORIGIN, path);
}

const liveGateway: StripeTestGateway = {
  async checkout(request, secret) {
    if (!secret.startsWith("sk_test_") && !secret.startsWith("sk_live_")) throw new Error("STRIPE_KEY_REQUIRED");
    if (!request.providerPriceRef?.startsWith("price_")) throw new Error("STRIPE_TEST_PRICE_REQUIRED");
    const stripe = new Stripe(secret);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: request.providerPriceRef, quantity: 1 }],
      ...(request.providerCustomerRef ? { customer: request.providerCustomerRef } : {}),
      client_reference_id: request.organizationId,
      success_url: absoluteReturnUrl(`${request.returnPath}?checkout=success`),
      cancel_url: absoluteReturnUrl(`${request.returnPath}?checkout=cancelled`),
      locale: request.locale ?? "auto",
      metadata: {
        kjora_organization_id: request.organizationId,
        kjora_plan: request.plan,
        kjora_cycle: request.cycle,
        kjora_currency: request.currency,
        kjora_intent_key: request.idempotencyKey,
      },
      subscription_data: {
        metadata: {
          kjora_organization_id: request.organizationId,
          kjora_plan: request.plan,
          kjora_cycle: request.cycle,
          kjora_intent_key: request.idempotencyKey,
        },
      },
    }, { idempotencyKey: request.idempotencyKey });
    const expectedLive = secret.startsWith("sk_live_");
    if (!session.url || session.livemode !== expectedLive || !session.id.startsWith(expectedLive ? "cs_live_" : "cs_test_")) {
      throw new Error("STRIPE_SESSION_REJECTED");
    }
    return {
      providerSessionRef: session.id,
      redirectUrl: session.url,
      expiresAt: new Date(session.expires_at * 1000).toISOString(),
      recurrence: "unattended",
    };
  },

  async portal(request, secret) {
    if (!secret.startsWith("sk_test_") && !secret.startsWith("sk_live_")) throw new Error("STRIPE_KEY_REQUIRED");
    const stripe = new Stripe(secret);
    const session = await stripe.billingPortal.sessions.create({
      customer: request.providerCustomerRef,
      return_url: absoluteReturnUrl(request.returnPath),
    });
    if (!session.url.includes("billing.stripe.com/")) throw new Error("STRIPE_TEST_PORTAL_REJECTED");
    return { redirectUrl: session.url, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
  },

  verify(rawBody, signature, webhookSecret) {
    return Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  },
};

export function createStripeAdapter(
  gateway: StripeTestGateway = liveGateway,
  env: NodeJS.ProcessEnv = process.env,
  environment: "test" | "live" = "test",
): BillingProviderAdapter {
  const live = environment === "live";
  const mode: ProviderMode = live ? "live" : "sandbox";
  const secret = env[live ? "STRIPE_LIVE_SECRET_KEY" : "STRIPE_SANDBOX_SECRET_KEY"]?.trim() ?? "";
  const webhook = env[live ? "STRIPE_LIVE_WEBHOOK_SECRET" : "STRIPE_SANDBOX_WEBHOOK_SECRET"]?.trim() ?? "";
  return {
    name: "stripe",
    mode,
    async createCheckout(request) {
      if (request.currency !== "CAD") throw new Error("STRIPE_TEST_CAD_ONLY");
      if (live ? !secret.startsWith("sk_live_") : !secret.startsWith("sk_test_")) {
        throw new Error("STRIPE_ENVIRONMENT_KEY_MISMATCH");
      }
      const session = await gateway.checkout(request, secret);
      const expectedPrefix = live ? "cs_live_" : "cs_test_";
      if (!session.providerSessionRef.startsWith(expectedPrefix)) throw new Error("STRIPE_SESSION_MODE_MISMATCH");
      return session;
    },
    async openCustomerPortal(request) {
      return gateway.portal(request, secret);
    },
    async verifyWebhook(rawBody, headers): Promise<WebhookVerification> {
      const signature = headers["stripe-signature"];
      if (!signature) return { valid: false, reason: "missing_signature" };
      if (!webhook) return { valid: false, reason: "provider_not_configured" };
      try {
        const event = gateway.verify(rawBody, signature, webhook);
        if (event.livemode !== live || !event.id) return { valid: false, reason: "invalid_signature" };
        return {
          valid: true,
          providerEventId: event.id,
          eventType: event.type,
          payload: JSON.parse(JSON.stringify(event)) as Record<string, unknown>,
        };
      } catch {
        return { valid: false, reason: "invalid_signature" };
      }
    },
  };
}

export function createStripeTestAdapter(gateway: StripeTestGateway = liveGateway, env: NodeJS.ProcessEnv = process.env) {
  return createStripeAdapter(gateway, env, "test");
}
