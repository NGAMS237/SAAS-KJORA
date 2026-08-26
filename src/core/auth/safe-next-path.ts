export function safeNextPath(value: string | null | undefined, origin?: string) {
  if (!value) return "/app";
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  if (!origin) return "/app";
  try {
    const parsed = new URL(value);
    if (parsed.origin !== origin || !parsed.pathname.startsWith("/")) return "/app";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/app";
  }
}
