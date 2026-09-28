export function safeNextPath(value: string | null | undefined, origin?: string) {
  if (!value) return "/app";

  // URL parsers discard tabs/newlines before interpreting a URL. Returning a
  // raw relative path containing one can therefore turn `/<tab>//host` into
  // a protocol-relative redirect when the caller later resolves it.
  if (/[\u0000-\u0020\u007f-\u009f\\]/u.test(value)) return "/app";
  if (/%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/iu.test(value)) return "/app";

  try {
    const base = new URL(origin ?? "https://kjora.invalid");
    const isAbsoluteUrl = /^[a-z][a-z\d+.-]*:/iu.test(value);
    if (value.startsWith("//") || (!value.startsWith("/") && (!origin || !isAbsoluteUrl))) return "/app";
    const parsed = new URL(value, base);
    if (parsed.origin !== base.origin || parsed.username || parsed.password) return "/app";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/app";
  }
}
