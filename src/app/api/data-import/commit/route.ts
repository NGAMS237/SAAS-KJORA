import { isSameOrigin } from "@/core/security/same-origin";
import { checkRateLimit, clientKey } from "@/core/security/rate-limit";
import { NextResponse, type NextRequest } from "next/server";
import { requireActiveCapability } from "@/core/authorization/server";
import { parseEntitlementError, entitlementErrorResponse } from "@/core/entitlements/server";
import { commitImport } from "@/modules/data-import/server";
import { IMPORT_SOURCES, MAX_IMPORT_ROWS, type CommitRowPayload, type ImportSource } from "@/modules/data-import/model";

export const runtime = "nodejs";

function sameOrigin(request: Request) {
  return isSameOrigin(request);
}

function mutationError(error: { code?: string; message?: string; details?: string } | null) {
  if (!error) return NextResponse.json({ error: "commit_failed" }, { status: 500 });
  if (error.code === "42501") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (error.code === "P0001") {
    const entitlementErr = parseEntitlementError(error.message ?? "", error.details ?? undefined);
    if (entitlementErr) return entitlementErrorResponse(entitlementErr);
    return NextResponse.json({ error: "business_rule_rejected", message: error.message }, { status: 409 });
  }
  if (["23503", "23514", "22023", "23P01"].includes(error.code ?? "")) {
    return NextResponse.json({ error: "business_rule_rejected", message: error.message }, { status: 409 });
  }
  return NextResponse.json({ error: "server_error" }, { status: 500 });
}

// IMPORT-01 §7 étape 7 — seule route qui écrit réellement des données. Tout
// le travail transactionnel (idempotence, quotas, rollback atomique) est fait
// dans la RPC `commit_data_import` (§13) ; cette route ne fait que valider la
// forme de la requête et traduire les erreurs Postgres en réponses HTTP.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { authorization, status } = await requireActiveCapability("data_import.manage");
  if (!authorization) return NextResponse.json({ error: "forbidden" }, { status });
  {
    const limit = checkRateLimit(clientKey(request, "import-commit", authorization.userId), 10, 600000);
    if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { fileName, fileSha256, source, migrationAsOfDate, rows } = body;
  if (typeof fileName !== "string" || fileName.length < 1 || fileName.length > 260) {
    return NextResponse.json({ error: "invalid_file_name" }, { status: 400 });
  }
  if (typeof fileSha256 !== "string" || !/^[0-9a-f]{64}$/.test(fileSha256)) {
    return NextResponse.json({ error: "invalid_file_sha256" }, { status: 400 });
  }
  if (typeof source !== "string" || !(IMPORT_SOURCES as readonly string[]).includes(source)) {
    return NextResponse.json({ error: "invalid_source" }, { status: 400 });
  }
  if (typeof migrationAsOfDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(migrationAsOfDate)) {
    return NextResponse.json({ error: "invalid_migration_date" }, { status: 400 });
  }
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json({ error: "invalid_rows" }, { status: 400 });
  }

  const { data, error } = await commitImport(
    authorization.organizationId,
    { fileName, mimeType: "application/octet-stream", sizeBytes: 0 },
    fileSha256,
    source as ImportSource,
    migrationAsOfDate,
    rows as CommitRowPayload[],
  );
  if (error || !data) return mutationError(error);
  return NextResponse.json(data, { status: data.alreadyImported ? 200 : 201 });
}
