import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260831090000_lot_6e_tenant_portal_access.sql", import.meta.url), "utf8");
const server = readFileSync(new URL("../src/tenant-portal/server.ts", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/tenant-portal/portal-shell.tsx", import.meta.url), "utf8");
const views = readFileSync(new URL("../src/tenant-portal/views.tsx", import.meta.url), "utf8");
const notificationView = readFileSync(new URL("../src/tenant-portal/notifications-view.tsx", import.meta.url), "utf8");
const management = readFileSync(new URL("../src/tenant-portal/access-management.tsx", import.meta.url), "utf8");
const login = readFileSync(new URL("../src/tenant-portal/login-form.tsx", import.meta.url), "utf8");
const documentRoute = readFileSync(new URL("../src/app/api/tenant-portal/documents/[documentId]/download/route.ts", import.meta.url), "utf8");
const portalLayout = readFileSync(new URL("../src/app/(portal)/portal/layout.tsx", import.meta.url), "utf8");
const internalLayout = readFileSync(new URL("../src/app/(internal)/app/layout.tsx", import.meta.url), "utf8");
const notificationPatch = readFileSync(new URL("../supabase/migrations/20260901120731_post_6e_portal_notifications_pin_notice.sql", import.meta.url), "utf8");

test("TenantPortalAccess is structurally separate from internal Memberships", () => {
  assert.match(migration, /create table public\.tenant_portal_accesses/i);
  assert.match(migration, /user_id uuid references auth\.users/i);
  assert.match(migration, /organization_id uuid not null/i);
  assert.match(migration, /tenant_id uuid not null/i);
  assert.doesNotMatch(migration, /insert into public\.memberships/i);
  assert.doesNotMatch(shell, /\/app(?:\/|"|')/);
  assert.match(internalLayout, /has_tenant_portal_identity/);
});

test("portal tables are default-deny and public/anon cannot execute portal RPCs", () => {
  for (const table of ["tenant_portal_accesses", "tenant_portal_lease_accesses", "tenant_portal_invitations", "tenant_portal_sessions", "tenant_portal_document_views"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(migration, /revoke all on public\.tenant_portal_accesses[\s\S]*from public, anon, authenticated/i);
  for (const fn of ["create_tenant_portal_invitation", "accept_tenant_portal_invitation", "get_tenant_portal_home", "list_tenant_portal_dues", "list_tenant_portal_payments", "list_tenant_portal_documents"]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}\\(`, "i"));
  }
});

test("every portal read crosses user, active session, tenant and explicit lease scope", () => {
  assert.match(migration, /a\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /s\.auth_session_id = \(select private\.current_portal_auth_session_id\(\)\)/i);
  assert.match(migration, /s\.expires_at > now\(\)/i);
  assert.match(migration, /l\.tenant_id = la\.tenant_id/i);
  assert.match(migration, /private\.has_tenant_portal_lease_access\(target_access_id, target_lease_id\)/i);
  assert.match(migration, /on conflict \(access_id, auth_session_id\) do nothing/i);
});

test("multi-Organization session startup cannot reuse stale loop state or silently renew expiry", () => {
  assert.match(migration, /order by id[\s\S]*current_session_id := null/i);
  assert.match(migration, /created_new_session := false/i);
  assert.match(migration, /expires_at <= now\(\)[\s\S]*'session_expired', 'refused'/i);
});

test("invitations are explicit, hashed, expiring, single-use and capability scoped", () => {
  assert.match(migration, /token_hash text not null unique/i);
  assert.match(migration, /extensions\.digest\(convert_to\(raw_token, 'utf8'\), 'sha256'\)/i);
  assert.match(migration, /now\(\) \+ interval '7 days'/i);
  assert.match(migration, /status <> 'pending'/i);
  assert.match(migration, /private\.has_capability\([^)]*'tenant_portal\.manage'/i);
  assert.match(management, /action: "invite", tenantId, leaseIds/);
  assert.match(management, /action: "resend"/);
  assert.match(management, /action: "revoke"/);
});

test("portal auth remains Supabase email OTP or Magic Link while the PIN is only a local lock", () => {
  assert.match(login, /signInWithOtp/);
  assert.match(login, /verifyOtp/);
  assert.match(login, /startsWith\("\/portal\/invitation\/accepter"\)/);
  assert.match(portalLayout, /loadPortalContext/);
  assert.match(portalLayout, /PinLockProvider/);
  assert.match(portalLayout, /scope="portal"/);
  assert.doesNotMatch(notificationPatch, /pin|PBKDF2|indexedDB/i);
});

test("portal notifications are active-access scoped, actionable and unavailable to anon/public", () => {
  assert.match(notificationPatch, /private\.has_active_tenant_portal_access\(target_access_id\)/i);
  assert.match(notificationPatch, /recipient_tenant_portal_access_id/i);
  assert.match(notificationPatch, /revoke all on function public\.list_my_tenant_portal_notifications\(uuid, integer\) from public, anon/i);
  assert.match(notificationPatch, /grant execute on function public\.list_my_tenant_portal_notifications\(uuid, integer\) to authenticated/i);
  assert.match(notificationView, /portalNotificationHref/);
  assert.match(notificationView, /mark_all_read/);
  assert.doesNotMatch(notificationPatch, /email_enabled\s*=\s*true|public\s*=\s*true/i);
});

test("future due notices reuse financial truth without backfill", () => {
  assert.match(notificationPatch, /public\.dues_with_status/i);
  assert.match(notificationPatch, /'payment_allocated_xaf'/i);
  assert.match(notificationPatch, /'credit_applied_xaf'/i);
  assert.doesNotMatch(notificationPatch, /update public\.financial_documents|insert into public\.financial_documents/i);
});

test("portal child scopes are constrained by Organization, Access and Tenant", () => {
  assert.match(migration, /leases_organization_id_id_tenant_key unique \(organization_id, id, tenant_id\)/i);
  assert.match(migration, /foreign key \(organization_id, lease_id, tenant_id\)[\s\S]*references public\.leases \(organization_id, id, tenant_id\)/i);
  assert.match(migration, /financial_documents_organization_id_id_tenant_key unique \(organization_id, id, tenant_id\)/i);
  assert.match(migration, /foreign key \(organization_id, document_id, tenant_id\)[\s\S]*references public\.financial_documents \(organization_id, id, tenant_id\)/i);
});

test("financial views consume existing projections and do not recalculate the ledger", () => {
  assert.match(migration, /public\.dues_with_status/i);
  assert.match(migration, /public\.tenant_financial_positions/i);
  assert.match(migration, /public\.payments/i);
  assert.match(migration, /public\.payment_allocations/i);
  assert.match(views, /Crédit appliqué/);
  assert.match(views, /Paiements reçus/);
  assert.match(views, /Dépôt de garantie/);
  assert.doesNotMatch(views, /ledger_entries|debit_xaf|credit_xaf/i);
});

test("private documents use the existing renderer and short signed URLs", () => {
  assert.match(documentRoute, /get_tenant_portal_document/);
  assert.match(documentRoute, /createSignedUrl\([^,]+,\s*120,/);
  assert.match(documentRoute, /generateFinancialDocumentPdf/);
  assert.match(migration, /bucket_id = 'financial-documents'/i);
  assert.doesNotMatch(migration, /update storage\.buckets set public = true/i);
});

test("6E does not add providers, signatures or financial email activation", () => {
  for (const source of [migration, server, shell, views]) {
    assert.doesNotMatch(source, /flutterwave|campay|stripe|subaccount/i);
    assert.doesNotMatch(source, /signature électronique|electronic signature/i);
    assert.doesNotMatch(source, /KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED\s*=\s*true/i);
  }
});
