import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { checkRateLimit, resetRateLimits } from "../src/core/security/rate-limit.ts";

test("bloque au-delà de la limite puis se réarme après la fenêtre", () => {
  resetRateLimits();
  assert.equal(checkRateLimit("k", 2, 1000, 0).allowed, true);
  assert.equal(checkRateLimit("k", 2, 1000, 10).allowed, true);
  const blocked = checkRateLimit("k", 2, 1000, 20);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
  assert.equal(checkRateLimit("k", 2, 1000, 1500).allowed, true);
});

test("les clés sont indépendantes", () => {
  resetRateLimits();
  checkRateLimit("a", 1, 1000, 0);
  assert.equal(checkRateLimit("a", 1, 1000, 1).allowed, false);
  assert.equal(checkRateLimit("b", 1, 1000, 1).allowed, true);
});

test("import et support appellent le limiteur après authentification", () => {
  for (const file of ["src/app/api/data-import/preview/route.ts", "src/app/api/data-import/commit/route.ts", "src/app/api/support/route.ts"]) {
    assert.match(readFileSync(file, "utf8"), /checkRateLimit\(/, file);
  }
});
