/**
 * Safe extraction of the subscription period carried by Stripe invoice events.
 * Stripe may omit top-level invoice period fields and place them on a line.
 * We only accept finite Unix timestamps; the database still validates the
 * amount, currency, provider reference and period ordering.
 */
export type StripeWebhookRecord = Record<string, unknown>;

function record(value: unknown): StripeWebhookRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as StripeWebhookRecord
    : {};
}

function timestamp(value: unknown): string | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? new Date(value * 1000).toISOString()
    : null;
}

export function stripeInvoicePeriod(object: StripeWebhookRecord): { start: string | null; end: string | null } {
  const lines = record(object.lines).data;
  if (Array.isArray(lines)) {
    // Stripe's invoice-level period is the window in which invoice items were
    // added. On an initial subscription invoice it can be a zero-length
    // window, while the subscription line carries the actual service period.
    // Newer API versions identify that line through parent.type; older ones
    // used line.type. Prefer the line contract in both representations.
    const subscriptionLine = lines.find((line) => {
      const item = record(line);
      return item.type === "subscription"
        || record(item.parent).type === "subscription_item_details";
    }) ?? lines[0];
    const period = record(record(subscriptionLine).period);
    const linePeriod = { start: timestamp(period.start), end: timestamp(period.end) };
    if (linePeriod.start && linePeriod.end && linePeriod.end > linePeriod.start) return linePeriod;
  }

  const direct = { start: timestamp(object.period_start), end: timestamp(object.period_end) };
  return direct.start && direct.end && direct.end > direct.start
    ? direct
    : { start: null, end: null };
}
