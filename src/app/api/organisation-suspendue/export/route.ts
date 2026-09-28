import { NextResponse, type NextRequest } from "next/server";
import { resolveMyRestrictedOrganization } from "@/core/organization/restricted-organizations";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { XLSX_STANDARD_SCOPES, isExportScope, type ExportScope } from "@/modules/data-export/model";
import {
  RESTRICTED_OWNER_EXPORT_SCOPES,
  buildCsvExport,
  buildXlsxExport,
  estimateExportRowCounts,
} from "@/modules/data-export/server";

// =============================================================================
// REVENUE-LAUNCH-01 v3 — Export du propriétaire d'une Organization SUSPENDUE
// =============================================================================
// Politique décidée : seul l'organization_owner actif d'une Organization
// suspendue exporte ses données, en lecture seule (CSV ou XLSX, jamais le ZIP
// de documents PDF). Collaborateurs, locataires et Organizations archivées :
// aucune exception.
//
// Barrières :
//   1. l'Organization demandée doit figurer dans list_my_restricted_organizations
//      avec can_export = true (calculé en base : Owner actif + 'suspended') ;
//   2. request_data_export revérifie private.can_export_organization_data et
//      refuse le ZIP pour une Organization suspendue ;
//   3. chaque lecture passe par export_restricted_owner_source, qui revérifie
//      has_restricted_capability('data_export.manage') et l'entitlement.
// L'export reste journalisé (data_exports) comme tout export EXPORT-01.
// Une Organization ACTIVE n'utilise jamais cette route (EXPORT-01 inchangé).
// =============================================================================

export const runtime = "nodejs";
export const maxDuration = 60;

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function readInput(request: NextRequest): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    return Object.fromEntries(Object.entries(body ?? {}).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  }
  const form = await request.formData().catch(() => null);
  const result: Record<string, string> = {};
  form?.forEach((value, key) => { if (typeof value === "string") result[key] = value; });
  return result;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const input = await readInput(request);
  const organizationId = input.organizationId ?? "";
  const format = input.format === "csv" ? "csv" : input.format === "xlsx" ? "xlsx" : null;
  if (!format) return NextResponse.json({ error: "invalid_export_format" }, { status: 400 });

  const { selected } = await resolveMyRestrictedOrganization(organizationId);
  if (!selected || selected.id !== organizationId || selected.status !== "suspended" || !selected.canExport) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let scopes: ExportScope[];
  if (format === "csv") {
    const scope = input.scope ?? "";
    if (!isExportScope(scope) || !RESTRICTED_OWNER_EXPORT_SCOPES.includes(scope)) {
      return NextResponse.json({ error: "invalid_export_scope" }, { status: 400 });
    }
    scopes = [scope];
  } else {
    scopes = XLSX_STANDARD_SCOPES.filter((scope) => RESTRICTED_OWNER_EXPORT_SCOPES.includes(scope));
  }

  const range = { from: null, to: null };
  const { applyAuthState, supabase } = createSupabaseRouteHandlerClient(request);

  let rowCounts;
  try {
    rowCounts = await estimateExportRowCounts(selected.id, scopes, range, "restricted_owner");
  } catch {
    return applyAuthState(NextResponse.json({ error: "export_preview_failed" }, { status: 500 }));
  }

  const requested = await supabase.rpc("request_data_export", {
    target_organization_id: selected.id,
    target_format: format,
    target_scope: scopes,
    target_row_counts: rowCounts,
    target_range_from: null,
    target_range_to: null,
  });
  if (requested.error || typeof requested.data !== "string") {
    const status = requested.error?.code === "42501" ? 403 : requested.error?.code === "P0001" ? 402 : 400;
    return applyAuthState(NextResponse.json({ error: "export_request_refused" }, { status }));
  }

  let bytes: Buffer;
  try {
    bytes = format === "csv"
      ? await buildCsvExport(selected.id, scopes[0], range, "restricted_owner")
      : await buildXlsxExport(selected.id, range, scopes, "restricted_owner");
  } catch {
    return applyAuthState(NextResponse.json({ error: "export_generation_failed" }, { status: 500 }));
  }

  await supabase.rpc("record_data_export_download", { target_export_id: requested.data });

  const fileName = `kjora-export-${new Date().toISOString().slice(0, 10)}.${format}`;
  return applyAuthState(new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": format === "csv"
        ? "text/csv; charset=utf-8"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  }));
}
