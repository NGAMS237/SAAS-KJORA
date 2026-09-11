import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { buildCsvDocument } from "../src/modules/data-export/csv.ts";
import { buildExportWorkbook } from "../src/modules/data-export/xlsx.ts";
import { buildZipArchive } from "../src/modules/data-export/zip.ts";
import {
  EXPORT_FORMATS,
  EXPORT_SCOPES,
  isExportFormat,
  isExportScope,
  parseDateRange,
  scopesForFormat,
  XLSX_STANDARD_SCOPES,
  ZIP_ADDITIONAL_SCOPES,
} from "../src/modules/data-export/model.ts";
import { sanitizeForDisplay } from "../src/modules/data-import/csv.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20260909180000_export_01_data_export.sql", import.meta.url),
  "utf8",
);
const contractsGrantMigration = readFileSync(
  new URL("../supabase/migrations/20260910191705_fix_lease_contracts_select_grant.sql", import.meta.url),
  "utf8",
);
const contractsRpcMigration = readFileSync(
  new URL("../supabase/migrations/20260910195812_export_01_contracts_summary_rpc.sql", import.meta.url),
  "utf8",
);
const contractsDirectAccessClosureMigration = readFileSync(
  new URL("../supabase/migrations/20260911153254_close_lease_contracts_direct_select.sql", import.meta.url),
  "utf8",
);
const exportServer = readFileSync(
  new URL("../src/modules/data-export/server.ts", import.meta.url),
  "utf8",
);
const contractsServer = readFileSync(
  new URL("../src/modules/contracts/server.ts", import.meta.url),
  "utf8",
);

function readSourceTree(directory: URL): string {
  return readdirSync(directory, { withFileTypes: true })
    .map((entry) => {
      const target = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directory);
      if (entry.isDirectory()) return readSourceTree(target);
      return /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) ? readFileSync(target, "utf8") : "";
    })
    .join("\n");
}

const applicationSource = readSourceTree(new URL("../src/", import.meta.url));

// ---------------------------------------------------------------------------
// §17/§18/§19 : garanties structurelles de la migration EXPORT-01.
// ---------------------------------------------------------------------------

test("la migration EXPORT-01 ne stocke aucun contenu de fichier ni PII dans data_exports", () => {
  assert.doesNotMatch(migration, /storage_path/i);
  assert.doesNotMatch(migration, /email text/i);
});

test("la migration EXPORT-01 déclare la capability data_export.manage en deny-by-default, Owner uniquement", () => {
  assert.match(migration, /'data_export\.manage'/);
  assert.match(migration, /insert into (?:public\.)?role_capabilities[\s\S]*organization_owner[\s\S]*data_export\.manage/i);
});

test("request_data_export revérifie RBAC et entitlement côté base (defense-in-depth)", () => {
  assert.match(migration, /private\.has_capability\(target_organization_id, 'data_export\.manage'\)/);
  assert.match(migration, /private\.check_plan_feature/);
});

test("le format zip exige exports_advanced, csv/xlsx exigent exports_standard", () => {
  assert.match(migration, /target_format\s*=\s*'zip'\s*then\s*'exports_advanced'/i);
});

test("data_exports n'autorise que la lecture directe ; les écritures passent par RPC", () => {
  // `authenticated` doit figurer dans la liste des rôles révoqués sur
  // data_exports (la migration révoque aussi public/anon dans la même
  // instruction : le test ne doit pas exiger une liste exacte, seulement
  // qu'authenticated en fasse bien partie).
  const revokeMatch = migration.match(/revoke all on public\.data_exports from ([^;]+);/i);
  assert.ok(revokeMatch, "aucune instruction REVOKE trouvée pour public.data_exports");
  const revokedRoles = revokeMatch[1].split(",").map((role) => role.trim());
  assert.ok(revokedRoles.includes("authenticated"), `authenticated doit être révoqué, rôles trouvés: ${revokedRoles.join(", ")}`);

  // Seul un SELECT doit ensuite être accordé à authenticated — aucune
  // écriture directe (insert/update/delete) ne doit lui être accordée.
  assert.match(migration, /grant select on public\.data_exports to authenticated/i);
  assert.doesNotMatch(migration, /grant\s+(?:insert|update|delete|all)[^;]*on public\.data_exports[^;]*to[^;]*authenticated/i);
});

test("la correction historique lease_contracts SELECT est versionnée sans droit d'écriture", () => {
  assert.match(contractsGrantMigration, /grant select on public\.lease_contracts to authenticated/i);
  assert.doesNotMatch(contractsGrantMigration, /grant\s+(?:insert|update|delete|all)/i);
});

test("la migration corrective ferme la lecture directe lease_contracts pour tous les rôles clients", () => {
  const sqlStatements = contractsDirectAccessClosureMigration.replace(/^--.*$/gm, "");
  assert.match(
    sqlStatements,
    /revoke select on table public\.lease_contracts from authenticated, anon, public/i,
  );
  assert.doesNotMatch(sqlStatements, /revoke[^;]*from service_role/i);
  assert.doesNotMatch(sqlStatements, /grant\s+/i);
});

test("la synthèse contrats utilise la RPC EXPORT-01 et non une lecture directe", () => {
  const start = exportServer.indexOf("async function readContractsSummary");
  const end = exportServer.indexOf("async function readScope", start);
  const block = exportServer.slice(start, end);
  assert.match(block, /supabase\.rpc\("list_contracts_for_export",\s*\{\s*target_organization_id: organizationId/);
  assert.doesNotMatch(block, /supabase\.from\("lease_contracts"\)/);
});

test("list_contracts_for_export est minimale, tenant-scoped et explicitement autorisée", () => {
  assert.match(contractsRpcMigration, /security definer[\s\S]*set search_path to ''/i);
  assert.match(contractsRpcMigration, /private\.has_capability\(target_organization_id, 'data_export\.manage'\)/);
  assert.match(contractsRpcMigration, /private\.check_plan_feature\(target_organization_id, 'exports_advanced'\)/);
  assert.match(contractsRpcMigration, /where c\.organization_id = target_organization_id/);
  assert.match(contractsRpcMigration, /grant execute[\s\S]*to authenticated/);
  assert.match(contractsRpcMigration, /revoke execute[\s\S]*from anon, public/);
  assert.match(
    contractsRpcMigration,
    /returns table \(\s*id uuid,\s*lease_id uuid,\s*tenant_id uuid,\s*reference text,\s*status text,\s*final_storage_path text,\s*created_at timestamptz\s*\)/i,
  );
  assert.doesNotMatch(contractsRpcMigration, /content_snapshot|data_snapshot|template_snapshot|stamp_snapshot/i);
});

test("les autres parcours contrats restent sur leurs RPC après fermeture du SELECT direct", () => {
  assert.doesNotMatch(contractsServer, /\.from\(["']lease_contracts["']\)/);
  for (const rpc of [
    "get_lease_contracts",
    "get_lease_contract",
    "list_my_tenant_portal_contracts",
    "get_my_tenant_portal_contract",
    "get_lease_contract_signatures",
    "finalize_lease_contract",
  ]) {
    assert.match(contractsServer, new RegExp(`\\.rpc\\("${rpc}"`));
  }
});

test("aucun module applicatif ne réintroduit un accès Supabase direct à lease_contracts", () => {
  assert.doesNotMatch(applicationSource, /\.from\(\s*["']lease_contracts["']\s*\)/);
});

// ---------------------------------------------------------------------------
// Modèle / scoping (§1, §2)
// ---------------------------------------------------------------------------

test("isExportFormat / isExportScope valident strictement l'ensemble autorisé", () => {
  for (const format of EXPORT_FORMATS) assert.ok(isExportFormat(format));
  assert.ok(!isExportFormat("pdf"));
  for (const scope of EXPORT_SCOPES) assert.ok(isExportScope(scope));
  assert.ok(!isExportScope("secrets"));
});

test("scopesForFormat : csv retombe sur 'properties' si aucun scope valide n'est demandé", () => {
  assert.deepEqual(scopesForFormat("csv", []), ["properties"]);
  assert.deepEqual(scopesForFormat("csv", ["tenants"]), ["tenants"]);
});

test("scopesForFormat : xlsx retombe sur les scopes standard si aucun n'est demandé", () => {
  assert.deepEqual(scopesForFormat("xlsx", []), XLSX_STANDARD_SCOPES);
});

test("scopesForFormat : zip inclut toujours les documents financiers et contrats en plus du standard", () => {
  const scopes = scopesForFormat("zip", []);
  for (const scope of XLSX_STANDARD_SCOPES) assert.ok(scopes.includes(scope));
  for (const scope of ZIP_ADDITIONAL_SCOPES) assert.ok(scopes.includes(scope));
});

test("parseDateRange valide le format et l'ordre from <= to", () => {
  assert.deepEqual(parseDateRange({ from: "2026-01-01", to: "2026-03-31" }), { from: "2026-01-01", to: "2026-03-31" });
  assert.equal(parseDateRange({ from: "2026-03-31", to: "2026-01-01" }), null);
  assert.equal(parseDateRange({ from: "not-a-date", to: null }), null);
});

// ---------------------------------------------------------------------------
// CSV injection (§7, §20) — même neutralisation que l'import (source unique).
// ---------------------------------------------------------------------------

test("buildCsvDocument neutralise les déclencheurs de formule dans chaque cellule", () => {
  const bytes = buildCsvDocument(["nom", "note"], [["Jean", "=cmd|'/c calc'!A1"]]);
  const csv = bytes.toString("utf8");
  assert.ok(csv.includes("'=cmd"));
  assert.ok(csv.startsWith("﻿"));
});

test("sanitizeForDisplay (réutilisée par l'export) neutralise =, +, -, @, tab, CR", () => {
  for (const trigger of ["=1+1", "+1234", "-1234", "@SUM(1)", "\t1234", "\r1234"]) {
    assert.equal(sanitizeForDisplay(trigger)[0], "'");
  }
  assert.equal(sanitizeForDisplay("Jean Dupont"), "Jean Dupont");
});

// ---------------------------------------------------------------------------
// XLSX (§2) — ouvrable, données correctes, pas de secret.
// ---------------------------------------------------------------------------

test("buildExportWorkbook produit un classeur XLSX valide avec les bonnes feuilles", () => {
  const bytes = buildExportWorkbook([
    { title: "Biens", headers: ["nom"], rows: [["Résidence A"]] },
    { title: "Locataires", headers: ["nom", "email"], rows: [["Jean", "=HYPERLINK(\"http://evil\")"]] },
  ]);
  assert.ok(bytes.byteLength > 0);
  // Signature ZIP (un XLSX est un ZIP) : PK\x03\x04
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
});

test("buildExportWorkbook ne produit jamais de noms de feuille en doublon ou invalides", () => {
  const longName = "Documents financiers de la période complète 2026";
  const bytes = buildExportWorkbook([
    { title: longName, headers: ["a"], rows: [] },
    { title: longName, headers: ["a"], rows: [] },
  ]);
  assert.ok(bytes.byteLength > 0);
});

// ---------------------------------------------------------------------------
// ZIP (§3) — structure minimale valide, pas de dépendance externe.
// ---------------------------------------------------------------------------

test("buildZipArchive produit une archive avec en-tête local, central directory et EOCD", () => {
  const zip = buildZipArchive([
    { name: "manifest.json", data: Buffer.from(JSON.stringify({ ok: true })) },
    { name: "export.xlsx", data: Buffer.from([0x50, 0x4b, 0x03, 0x04]) },
  ]);
  // EOCD signature 0x06054b50 doit être présente près de la fin.
  const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  assert.ok(zip.includes(eocdSignature));
  // Local file header signature 0x04034b50 doit apparaître (au moins deux fois : deux entrées).
  const localSignature = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  let occurrences = 0;
  let index = zip.indexOf(localSignature);
  while (index !== -1) { occurrences += 1; index = zip.indexOf(localSignature, index + 1); }
  assert.ok(occurrences >= 2);
});

test("buildZipArchive accepte un lot vide et produit tout de même un EOCD valide (0 entrée)", () => {
  const zip = buildZipArchive([]);
  const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  assert.ok(zip.includes(eocdSignature));
  assert.equal(zip.readUInt16LE(zip.indexOf(eocdSignature) + 10), 0); // 0 entrée au central directory
});
