import "server-only";

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { expectedCronAuthorization } from "@/modules/communications/config";
import { runDailyCommunications, summarizeDrain } from "@/modules/communications/server";

// =============================================================================
// NCE-01 — Orchestrateur quotidien unique (un seul cron Vercel, compatible
// Hobby : une exécution par jour). Autorisation « Bearer CRON_SECRET »
// vérifiée AVANT toute autre chose, en temps constant ; sans secret
// configuré, toujours 401. La réponse ne contient que des compteurs.
// =============================================================================

function authorized(request: NextRequest): boolean {
  const expected = expectedCronAuthorization(process.env);
  const received = request.headers.get("authorization");
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function handleDailyCommunicationsCron(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const startedAt = Date.now();
  const result = await runDailyCommunications(startedAt);
  return NextResponse.json({
    ok: result.ok,
    runId: result.runId,
    saasInvoicingDryRun: result.saasInvoicingDryRun,
    database: result.database,
    delivery: summarizeDrain(result.delivery),
  }, { status: result.ok ? 200 : 500, headers: { "cache-control": "no-store" } });
}
