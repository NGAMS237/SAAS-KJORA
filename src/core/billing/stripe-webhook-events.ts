/**
 * Closed Stripe event contract. A verified event outside this list is
 * acknowledged without reaching the database or producing a business effect.
 */
export const STRIPE_ACCEPTED_WEBHOOK_EVENTS = [
  "charge.refunded",
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.created",
  "invoice.finalized",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
] as const;

const STRIPE_PASSIVE_WEBHOOK_EVENTS = new Set<string>([
  "invoice.created",
  "invoice.finalized",
]);

export function isAcceptedStripeWebhookEvent(eventType: string): boolean {
  return (STRIPE_ACCEPTED_WEBHOOK_EVENTS as readonly string[]).includes(eventType);
}

/** Only accepted events outside the passive invoice lifecycle reach the RPC. */
export function stripeWebhookHasBusinessEffect(eventType: string): boolean {
  return isAcceptedStripeWebhookEvent(eventType) && !STRIPE_PASSIVE_WEBHOOK_EVENTS.has(eventType);
}
