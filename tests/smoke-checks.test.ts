import assert from "node:assert/strict";
import test from "node:test";

import { runSmokeChecks } from "../scripts/smoke-checks.ts";

const SECURITY = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000",
};

function fakeFetch(options: { sameOriginPostStatus: number }) {
  return async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const headers = new Headers(init?.headers);
    if (init?.method === "POST") {
      if (headers.get("origin") !== url.origin) return new Response("", { status: 403 });
      return new Response("", { status: url.pathname.includes("data-import") ? 401 : options.sameOriginPostStatus });
    }
    return new Response("ok", { status: 200, headers: SECURITY });
  };
}

test("un site sain passe toutes les vérifications", async () => {
  const results = await runSmokeChecks("https://exemple.test", fakeFetch({ sameOriginPostStatus: 401 }));
  assert.ok(results.length >= 6);
  assert.deepEqual(results.filter((r) => !r.ok), []);
});

test("détecte la régression 403 sur les POST de même origine", async () => {
  const results = await runSmokeChecks("https://exemple.test", fakeFetch({ sameOriginPostStatus: 403 }));
  const failed = results.filter((r) => !r.ok);
  assert.ok(failed.some((r) => r.name.startsWith("REGRESSION 403")));
});

test("détecte l'absence d'en-têtes de sécurité et les erreurs réseau", async () => {
  const noHeaders = async () => new Response("ok", { status: 200 });
  const results = await runSmokeChecks("https://exemple.test", noHeaders);
  assert.ok(results.some((r) => !r.ok && r.name.includes("en-têtes")));
  const boom = async () => { throw new Error("down"); };
  const down = await runSmokeChecks("https://exemple.test", boom);
  assert.ok(down.every((r) => !r.ok));
});
