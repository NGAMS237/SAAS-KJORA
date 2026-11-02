import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261103120000_lease_co_tenants.sql", "utf8");

test("la migration colocation est additive et protégée par RLS", () => {
  assert.match(migration, /create table if not exists public\.lease_co_tenants/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /has_capability\(organization_id, 'lease\.manage'\)/);
  assert.doesNotMatch(migration, /alter table public\.(leases|dues|payments)/i);
  assert.doesNotMatch(migration, /drop table/i);
});

test("la route refuse les origines étrangères et exige lease.manage", () => {
  const route = readFileSync("src/app/api/tenancy/co-tenants/route.ts", "utf8");
  assert.match(route, /isSameOrigin\(request\)/);
  assert.match(route, /requireActiveCapability\("lease\.manage"\)/);
});

test("la page de bail reste fonctionnelle avant la migration", () => {
  const server = readFileSync("src/modules/tenancy/co-tenants.ts", "utf8");
  assert.match(server, /available: false/);
});
