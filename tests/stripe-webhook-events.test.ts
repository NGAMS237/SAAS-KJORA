import assert from "node:assert/strict";
import test from "node:test";
import {
  isAcceptedStripeWebhookEvent,
  stripeWebhookHasBusinessEffect,
} from "../src/core/billing/stripe-webhook-events.ts";

test("les webhooks Stripe inconnus sont reconnus sans effet métier", () => {
  assert.equal(isAcceptedStripeWebhookEvent("unsupported.event"), false);
  assert.equal(stripeWebhookHasBusinessEffect("unsupported.event"), false);
});

test("les factures créées ou finalisées sont acceptées sans activation", () => {
  for (const eventType of ["invoice.created", "invoice.finalized"]) {
    assert.equal(isAcceptedStripeWebhookEvent(eventType), true);
    assert.equal(stripeWebhookHasBusinessEffect(eventType), false);
  }
});

test("invoice.paid reste l'événement de confirmation de paiement", () => {
  assert.equal(isAcceptedStripeWebhookEvent("invoice.paid"), true);
  assert.equal(stripeWebhookHasBusinessEffect("invoice.paid"), true);
});
