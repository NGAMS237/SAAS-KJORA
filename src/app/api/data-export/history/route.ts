import { NextResponse } from "next/server";
import { requireActiveCapability } from "@/core/authorization/server";
import { listExportHistory } from "@/modules/data-export/server";

export const runtime = "nodejs";

export async function GET() {
  const { authorization, status } = await requireActiveCapability("data_export.manage");
  if (!authorization) return NextResponse.json({ error: "forbidden" }, { status });

  try {
    const exports = await listExportHistory(authorization.organizationId);
    return NextResponse.json({ exports });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
