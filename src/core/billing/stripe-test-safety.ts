const CONTROL_OR_BACKSLASH = /[\u0000-\u0020\u007f-\u009f\\]/u;

export function isStripeTestSecret(value: string | null | undefined): boolean {
  return Boolean(value?.trim().startsWith("sk_test_"));
}

export function isStripeLiveSecret(value: string | null | undefined): boolean {
  return Boolean(value?.trim().startsWith("sk_live_"));
}

export function isStripePublishableKey(value: string | null | undefined, mode: "test" | "live"): boolean {
  return Boolean(value?.trim().startsWith(mode === "live" ? "pk_live_" : "pk_test_"));
}

export function isStripeWebhookSecret(value: string | null | undefined): boolean {
  return Boolean(value?.trim().startsWith("whsec_"));
}

export function stripeReturnUrl(originValue: string | null | undefined, path: string): string {
  if (!originValue?.trim()) throw new Error("STRIPE_TEST_ORIGIN_NOT_CONFIGURED");
  const origin = new URL(originValue.trim());
  const localHttp = origin.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(origin.hostname);
  if (origin.protocol !== "https:" && !localHttp) throw new Error("STRIPE_TEST_ORIGIN_NOT_ALLOWED");
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
    throw new Error("STRIPE_TEST_ORIGIN_NOT_ALLOWED");
  }
  if (!path.startsWith("/") || path.startsWith("//") || CONTROL_OR_BACKSLASH.test(path)) {
    throw new Error("STRIPE_TEST_RETURN_PATH_NOT_ALLOWED");
  }
  const result = new URL(path, origin);
  if (result.origin !== origin.origin) throw new Error("STRIPE_TEST_RETURN_PATH_NOT_ALLOWED");
  return result.toString();
}
