import { NextResponse, type NextRequest } from "next/server";
import { requireActiveCapability } from "@/core/authorization/server";
import { ImportFileError } from "@/modules/data-import/csv";
import { previewImport } from "@/modules/data-import/server";
import type { ColumnMapping } from "@/modules/data-import/model";

export const runtime = "nodejs";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

// IMPORT-01 §8 : cette route ne fait AUCUNE écriture métier. Elle lit
// uniquement le contexte existant de l'Organization (pour détecter les
// doublons et le quota) et retourne un aperçu ; rien n'est enregistré tant
// que /api/data-import/commit n'est pas appelé explicitement (§7 étape 7).
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { authorization, status } = await requireActiveCapability("data_import.manage");
  if (!authorization) return NextResponse.json({ error: "forbidden" }, { status });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("file");
  const migrationAsOfDate = form.get("migrationAsOfDate");
  const columnMappingRaw = form.get("columnMapping");

  if (!(file instanceof File)) return NextResponse.json({ error: "file_missing" }, { status: 400 });
  if (typeof migrationAsOfDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(migrationAsOfDate)) {
    return NextResponse.json({ error: "invalid_migration_date" }, { status: 400 });
  }

  let columnMapping: ColumnMapping[] | undefined;
  if (typeof columnMappingRaw === "string" && columnMappingRaw.length > 0) {
    try {
      const parsed = JSON.parse(columnMappingRaw) as unknown;
      if (Array.isArray(parsed)) columnMapping = parsed as ColumnMapping[];
    } catch {
      return NextResponse.json({ error: "invalid_column_mapping" }, { status: 400 });
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const preview = await previewImport(
      authorization.organizationId,
      { fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: buffer.byteLength },
      buffer,
      migrationAsOfDate,
      columnMapping,
    );
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof ImportFileError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 422 });
    }
    return NextResponse.json({ error: "preview_failed" }, { status: 500 });
  }
}
