import { NextResponse } from "next/server";
import { resolvePlatformAdmin } from "@/core/authorization/platform-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildCsvDocument } from "@/modules/data-export/csv";

// =============================================================================
// KJORA — REVENUE-LAUNCH-01 — Sous-lot 01I — Export Admin minimal (contacts)
// =============================================================================
// Distinct du mécanisme EXPORT-01 (data_exports, request_data_export) : celui-
// ci est borné à UNE Organization (portabilité self-service, capability
// `data_export.manage`). Ici, l'export est transversal (toutes les
// Organizations) et réservé à platform_admin — resolvePlatformAdmin() est la
// même garde que /administration/** (voir layout.tsx), et la RPC
// (admin_list_commercial_contacts_for_export) revérifie elle-même
// assert_platform_admin : double barrière, comme le reste de la console.
//
// Réutilise buildCsvDocument (EXPORT-01) — pas de seconde implémentation CSV.
// Aucun envoi : ce fichier ne fait que générer un téléchargement, jamais un
// courriel ni une campagne.
// =============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const decision = await resolvePlatformAdmin();
  if (!decision.allowed) {
    // Même discipline que la garde de page (layout.tsx) : jamais un message
    // qui confirme à un tiers que cette route existe et ce qu'elle contient.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_list_commercial_contacts_for_export");
  if (error) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  // REVENUE-LAUNCH-01 — organization_status, consent_version et marketing_eligible
  // ajoutés par admin_list_commercial_contacts_for_export : jamais d'export
  // silencieusement en retard sur la console (mêmes colonnes que la liste,
  // voir platform-admin/views.tsx).
  const headers = [
    "organization_name", "organization_status", "owner_email", "phone", "country", "language",
    "marketing_consent", "marketing_consent_at", "consent_source", "consent_version", "unsubscribed_at",
    "marketing_eligible",
  ];
  const csvRows = rows.map((r) => [
    r.organization_name ?? "",
    r.organization_status ?? "",
    r.owner_email ?? "",
    r.phone ?? "",
    r.country ?? "",
    r.language ?? "",
    r.marketing_consent === true ? "true" : "false",
    r.marketing_consent_at ?? "",
    r.consent_source ?? "",
    r.consent_version ?? "",
    r.unsubscribed_at ?? "",
    r.marketing_eligible === true ? "true" : "false",
  ]);
  const bytes = buildCsvDocument(headers, csvRows);

  const fileName = `kjora-contacts-commerciaux-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
