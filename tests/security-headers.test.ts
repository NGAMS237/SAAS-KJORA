import assert from "node:assert/strict";
import test from "node:test";

import nextConfig, { buildContentSecurityPolicy } from "../next.config.ts";

async function allHeaders() {
  const rules = await nextConfig.headers!();
  return rules;
}

test("tous les chemins reçoivent les en-têtes de sécurité", async () => {
  const rules = await allHeaders();
  const rule = rules.find((r) => r.source === "/:path*");
  assert.ok(rule, "règle /:path*");
  const names = rule.headers.map((h) => h.key.toLowerCase());
  for (const expected of [
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
    "strict-transport-security",
    "cross-origin-opener-policy",
    "content-security-policy-report-only",
  ]) {
    assert.ok(names.includes(expected), `manque ${expected}`);
  }
});

test("la CSP interdit objets, base étrangère et cadres externes", () => {
  const csp = buildContentSecurityPolicy();
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /frame-ancestors 'self'/);
});

test("l'entrée du service worker conserve ses en-têtes", async () => {
  const rules = await allHeaders();
  assert.ok(rules.some((r) => r.source === "/sw.js"));
});
