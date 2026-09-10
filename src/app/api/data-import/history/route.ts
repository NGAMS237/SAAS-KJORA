import { NextResponse } from "next/server";
import { requireActiveCapability } from "@/core/authorization/server";
import { listImportHistory } from "@/modules/data-import/server";

export const runtime = "nodejs";

export async function GET() {
  const { authorization, status } = await requireActiveCapability("data_import.manage");
  if (!authorization) return NextResponse.json({ error: "forbidden" }, { status });
  const history = await listImportHistory(authorization.organizationId);
  return NextResponse.json({ history });
}
