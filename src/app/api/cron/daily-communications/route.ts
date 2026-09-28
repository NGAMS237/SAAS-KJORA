import type { NextRequest } from "next/server";
import { handleDailyCommunicationsCron } from "@/modules/communications/cron-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return handleDailyCommunicationsCron(request);
}
