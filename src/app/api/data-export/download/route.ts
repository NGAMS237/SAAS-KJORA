import { NextResponse, type NextRequest } from "next/server";
import { requireActiveCapability } from "@/core/authorization/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { isExportFormat, isExportScope, type ExportFormat, type ExportScope } from "@/modules/data-export/model";
import { buildCsvExport, buildXlsxExport, buildZipExport } from "@/modules/data-export/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};

function extensionFor(format: ExportFormat) {
  return format;
}

export async function GET(request: NextRequest) {
  const { authorization, status } = await requireActiveCapability("data_export.manage");
  if (!authorization) return NextResponse.json({ error: "forbidden" }, { status });

  const exportId = request.nextUrl.searchParams.get("exportId");
  if (!exportId) return NextResponse.json({ error: "invalid_export_id" }, { status: 400 });

  const { applyAuthState, supabase } = createSupabaseRouteHandlerClient(request);

  // La policy RLS "authorized owners read data exports" filtre déjà par
  // capability + Organization ; le contrôle explicite ci-dessous est une
  // seconde barrière, pas la seule.
  const exportRow = await supabase.from("data_exports")
    .select("id, organization_id, format, scope, range_from, range_to, status")
    .eq("id", exportId).maybeSingle();
  if (exportRow.error) return applyAuthState(NextResponse.json({ error: "server_error" }, { status: 500 }));
  const row = exportRow.data;
  if (!row || row.organization_id !== authorization.organizationId) {
    return applyAuthState(NextResponse.json({ error: "not_found" }, { status: 404 }));
  }
  if (row.status !== "ready") return applyAuthState(NextResponse.json({ error: "export_not_ready" }, { status: 409 }));
  if (!isExportFormat(row.format)) return applyAuthState(NextResponse.json({ error: "server_error" }, { status: 500 }));

  const scope = (row.scope as string[]).filter(isExportScope) as ExportScope[];
  const range = { from: row.range_from as string | null, to: row.range_to as string | null };

  let bytes: Buffer;
  try {
    if (row.format === "csv") bytes = await buildCsvExport(authorization.organizationId, scope[0] ?? "properties", range);
    else if (row.format === "xlsx") bytes = await buildXlsxExport(authorization.organizationId, range, scope);
    else bytes = await buildZipExport(authorization.organizationId, range);
  } catch {
    return applyAuthState(NextResponse.json({ error: "export_generation_failed" }, { status: 500 }));
  }

  // Journalisation du téléchargement effectif (§24) — après génération
  // réussie uniquement : un échec de génération ne doit pas compter comme
  // "téléchargé".
  await supabase.rpc("record_data_export_download", { target_export_id: exportId });

  const fileName = `kjora-export-${new Date().toISOString().slice(0, 10)}.${extensionFor(row.format)}`;
  return applyAuthState(new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPES[row.format],
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  }));
}
