import { isSameOrigin } from "@/core/security/same-origin";
import { NextResponse, type NextRequest } from "next/server";
import { requireActiveCapability } from "@/core/authorization/server";
import { parseEntitlementError, entitlementErrorResponse } from "@/core/entitlements/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { isExportFormat, parseDateRange } from "@/modules/data-export/model";
import { estimateExportRowCounts, scopesForFormat } from "@/modules/data-export/server";

export const runtime = "nodejs";

function sameOrigin(request: Request) {
  return isSameOrigin(request);
}

// Estimation grossière, uniquement pour l'affichage "taille estimée" (§4) —
// jamais utilisée pour une décision de sécurité ou de facturation.
const AVERAGE_ROW_BYTES = 140;

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { authorization, status } = await requireActiveCapability("data_export.manage");
  if (!authorization) return NextResponse.json({ error: status === 402 ? "billing_blocked" : "forbidden" }, { status });

  let input: Record<string, unknown>;
  try { input = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const format = typeof input.format === "string" ? input.format : "";
  if (!isExportFormat(format)) return NextResponse.json({ error: "invalid_export_format" }, { status: 400 });

  const range = parseDateRange(input);
  if (!range) return NextResponse.json({ error: "invalid_export_range" }, { status: 400 });

  const requestedScope = Array.isArray(input.scope) ? input.scope.filter((v): v is string => typeof v === "string") : [];
  const scope = scopesForFormat(format, requestedScope);

  const { applyAuthState, supabase } = createSupabaseRouteHandlerClient(request);

  let rowCounts;
  try {
    rowCounts = await estimateExportRowCounts(authorization.organizationId, scope, range);
  } catch {
    return applyAuthState(NextResponse.json({ error: "export_preview_failed" }, { status: 500 }));
  }

  const result = await supabase.rpc("request_data_export", {
    target_organization_id: authorization.organizationId,
    target_format: format,
    target_scope: scope,
    target_row_counts: rowCounts,
    target_range_from: range.from,
    target_range_to: range.to,
  });

  if (result.error) {
    if (result.error.code === "42501") return applyAuthState(NextResponse.json({ error: "forbidden" }, { status: 403 }));
    if (result.error.code === "P0001") {
      const entitlementErr = parseEntitlementError(result.error.message ?? "", result.error.details ?? undefined);
      if (entitlementErr) return entitlementErrorResponse(entitlementErr);
      return applyAuthState(NextResponse.json({ error: "business_rule_rejected" }, { status: 409 }));
    }
    if (result.error.code === "22023") return applyAuthState(NextResponse.json({ error: "invalid_export_request" }, { status: 400 }));
    return applyAuthState(NextResponse.json({ error: "server_error" }, { status: 500 }));
  }

  const estimatedBytes = Object.values(rowCounts).reduce((sum: number, count) => sum + (Number(count) || 0) * AVERAGE_ROW_BYTES, 0);

  return applyAuthState(NextResponse.json({
    exportId: result.data as string,
    format,
    scope,
    rowCounts,
    estimatedBytes,
  }));
}
