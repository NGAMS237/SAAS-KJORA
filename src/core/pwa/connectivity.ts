export type ConnectivityState = "checking" | "online" | "offline";

export type ConnectivityEvent =
  | { type: "check_started" }
  | { type: "check_succeeded" }
  | { type: "check_failed" }
  | { type: "browser_offline" };

export function reduceConnectivity(
  state: ConnectivityState,
  event: ConnectivityEvent,
): ConnectivityState {
  if (event.type === "browser_offline" || event.type === "check_failed") return "offline";
  if (event.type === "check_succeeded") return "online";
  return state === "offline" ? "offline" : "checking";
}

/**
 * Probe a tiny public same-origin resource. Any HTTP response proves network
 * reachability; only a transport failure is treated as offline. No cookie,
 * session or private payload participates in the check.
 */
export async function probePublicConnectivity(
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  try {
    await fetcher(`/robots.txt?connectivity=${Date.now()}`, {
      method: "HEAD",
      cache: "no-store",
      credentials: "omit",
      headers: { "x-kjora-connectivity-check": "1" },
    });
    return true;
  } catch {
    return false;
  }
}
