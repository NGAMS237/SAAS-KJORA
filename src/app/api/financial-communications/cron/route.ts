import type { NextRequest } from "next/server";
import { handleDailyCommunicationsCron } from "@/modules/communications/cron-handler";

// NCE-01 — Alias de compatibilité : l'ancien chemin du cron appelle
// désormais le même orchestrateur unique que /api/cron/daily-communications
// (réservation atomique, Idempotency-Key, reprise après crash). vercel.json
// ne planifie plus qu'UN chemin ; celui-ci reste pour ne casser aucun appel
// manuel existant pendant la transition.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return handleDailyCommunicationsCron(request);
}
