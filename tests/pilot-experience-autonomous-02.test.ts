import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20261001090000_pilot_month_end_africa_preview.sql", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const proxy = readFileSync(new URL("../src/lib/supabase/proxy.ts", import.meta.url), "utf8");

test("la simulation de fin de mois est strictement en lecture seule et tenant-scoped", () => {
  assert.match(migration, /private\.has_capability\(target_organization_id, 'due\.view'\)/);
  assert.match(migration, /'mode', 'dry_run'/);
  assert.match(migration, /'conversionApplied', false/);
  assert.doesNotMatch(migration, /\b(insert|update|delete)\s+(into|public\.|from)\b/i);
});

test("les six devises immobilières restent séparées sans conversion", () => {
  for (const currency of ["XAF","XOF","NGN","CDF","KES","ZAR"]) assert.match(migration, new RegExp(`'${currency}'`));
  assert.doesNotMatch(migration, /exchange_rate|currency_conversion/i);
});

test("la simulation expose les étapes sans provoquer d'envoi", () => {
  for (const field of ["leasesSelected","documentsPrepared","documentsMissing","awaitingApproval","deferred","approved","queued"]) assert.match(migration, new RegExp(`'${field}'`));
  assert.doesNotMatch(migration, /resend|whatsapp/i);
});

test("la connexion ne force plus tout utilisateur authentifié vers l'application propriétaire", () => {
  assert.doesNotMatch(proxy, /authenticated && pathname === "\/connexion"/);
});

test("la PWA refuse les routes privées et les réponses authentifiées", () => {
  for (const prefix of ["/api/","/app/","/administration/","/portal/"]) assert.match(serviceWorker, new RegExp(prefix.replaceAll("/", "\\/")));
  assert.match(serviceWorker, /set-cookie/);
  assert.match(serviceWorker, /private\|no-store/);
});

test("les liens internes statiques ciblent une route Next existante", () => {
  const appRoot = new URL("../src/app/", import.meta.url);
  const pages = readdirSync(appRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === "page.tsx")
    .map((entry) => {
      const parent = entry.parentPath.replaceAll("\\", "/").split("/src/app/")[1] ?? "";
      const path = parent.split("/").filter((part) => part && !part.startsWith("(")).join("/");
      const pattern = `/${path}`.replace(/\/$/, "") || "/";
      return new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\[[^/]+\\\]/g, "[^/]+")}/?$`);
    });
  const sources = readdirSync(new URL("../src/", import.meta.url), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(tsx|ts)$/.test(entry.name));
  const broken = new Set<string>();
  for (const entry of sources) {
    const file = `${entry.parentPath}/${entry.name}`;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/href=["'](\/[^"'#?]*)(?:[?#][^"']*)?["']/g)) {
      const href = match[1] || "/";
      if (href.startsWith("/api/") || href.startsWith("/auth/")) continue;
      if (!pages.some((route) => route.test(href))) broken.add(href);
    }
  }
  assert.deepEqual([...broken].sort(), []);
});
