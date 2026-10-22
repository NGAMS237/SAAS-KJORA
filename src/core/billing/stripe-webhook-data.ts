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
  const direct = { start: timestamp(object.period_start), end: timestamp(object.period_end) };
  if (direct.start && direct.end) return direct;

  const lines = record(object.lines).data;
  if (!Array.isArray(lines)) return direct;
  // The subscription line is authoritative when present. Never manufacture a
  // period from invoice timestamps or from an unrelated invoice item.
  const subscriptionLine = lines.find((line) => record(line).type === "subscription") ?? lines[0];
  const period = record(record(subscriptionLine).period);
  return { start: timestamp(period.start), end: timestamp(period.end) };
}
