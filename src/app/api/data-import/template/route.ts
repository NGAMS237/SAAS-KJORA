import { NextResponse } from "next/server";
import { requireActiveCapability } from "@/core/authorization/server";
import { buildImportTemplateWorkbook } from "@/modules/data-import/xlsx";

export const runtime = "nodejs";

// §24 — modèle téléchargeable avec des exemples FICTIFS uniquement.
export async function GET() {
  const { authorization, status } = await requireActiveCapability("data_import.manage");
  if (!authorization) return NextResponse.json({ error: "forbidden" }, { status });

  const workbook = buildImportTemplateWorkbook();
  return new NextResponse(new Uint8Array(workbook), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=\"KJORA-IMPORT-TEMPLATE.xlsx\"",
      "Cache-Control": "no-store",
    },
  });
}
