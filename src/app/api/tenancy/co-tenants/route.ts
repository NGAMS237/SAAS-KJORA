import { NextResponse } from "next/server";
import { requireActiveCapability } from "@/core/authorization/server";
import { isSameOrigin } from "@/core/security/same-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UUID_PATTERN } from "@/modules/properties/model";

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

// Ajout / retrait d'un colocataire sur un bail. Le titulaire financier du bail
// n'est jamais modifié ici : seuls les occupants supplémentaires sont gérés.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("forbidden", 403);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || (body.action !== "add" && body.action !== "remove")) return jsonError("invalid_payload", 400);
  const access = await requireActiveCapability("lease.manage");
  if (!access.authorization) return jsonError(access.status === 401 ? "unauthenticated" : "forbidden", access.status);
  const { organizationId, userId } = access.authorization;
  const supabase = await createSupabaseServerClient();

  if (body.action === "add") {
    if (typeof body.leaseId !== "string" || !UUID_PATTERN.test(body.leaseId)) return jsonError("invalid_lease", 400);
    if (typeof body.tenantId !== "string" || !UUID_PATTERN.test(body.tenantId)) return jsonError("invalid_tenant", 400);
    const { data, error } = await supabase
      .from("lease_co_tenants")
      .insert({ organization_id: organizationId, lease_id: body.leaseId, tenant_id: body.tenantId, created_by: userId })
      .select("id")
      .single();
    if (error || !data) {
      if (error?.code === "23505") return jsonError("duplicate_resource", 409);
      if (error?.code === "23514") return jsonError("co_tenant_is_lease_holder", 409);
      if (error?.code === "23503") return jsonError("resource_unavailable", 404);
      if (error?.code === "42501") return jsonError("forbidden", 403);
      return jsonError("server_error", 500);
    }
    return NextResponse.json({ id: data.id }, { status: 201 });
  }

  if (typeof body.coTenantId !== "string" || !UUID_PATTERN.test(body.coTenantId)) return jsonError("invalid_co_tenant", 400);
  const { error } = await supabase.from("lease_co_tenants").delete().eq("organization_id", organizationId).eq("id", body.coTenantId);
  return error ? jsonError("server_error", 500) : NextResponse.json({ ok: true });
}
