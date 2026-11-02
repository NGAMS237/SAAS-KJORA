import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SECURITY_HEADERS, buildContentSecurityPolicy } from "../src/core/security/http-headers.ts";

// Ce test n'importe jamais next.config.ts : l'hébergeur peut remplacer ce fichier
// au moment de la compilation, et le typecheck de `next build` échouerait.

test("les en-têtes de sécurité attendus sont définis", () => {
  const names = SECURITY_HEADERS.map((h) => h.key.toLowerCase());
  for (const expected of ["x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "strict-transport-security", "cross-origin-opener-policy"]) {
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

test("next.config.ts applique les en-têtes partout et garde le service worker", () => {
  const config = readFileSync("next.config.ts", "utf8");
  assert.match(config, /from "\.\/src\/core\/security\/http-headers"/);
  assert.match(config, /source: "\/:path\*"/);
  assert.match(config, /\.\.\.SECURITY_HEADERS/);
  assert.match(config, /Content-Security-Policy-Report-Only/);
  assert.match(config, /source: "\/sw\.js"/);
  assert.doesNotMatch(config, /^export (function|const)/m);
});
