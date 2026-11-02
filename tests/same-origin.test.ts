import assert from "node:assert/strict";
import test from "node:test";

import { isSameOrigin } from "../src/core/security/same-origin.ts";

function req(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers });
}

test("sans Origin : accepté par défaut, refusé si requireOrigin", () => {
  assert.equal(isSameOrigin(req("https://kjorapp.com/api/x/")), true);
  assert.equal(isSameOrigin(req("https://kjorapp.com/api/x/"), { requireOrigin: true }), false);
});

test("même origine directe", () => {
  assert.equal(isSameOrigin(req("https://kjorapp.com/api/x/", { origin: "https://kjorapp.com" })), true);
});

test("derrière un proxy : URL interne http://localhost, x-forwarded-host public -> accepté", () => {
  const request = req("http://localhost:3000/api/x/", { origin: "https://kjorapp.com", "x-forwarded-host": "kjorapp.com", "x-forwarded-proto": "https" });
  assert.equal(isSameOrigin(request), true);
});

test("derrière un proxy : URL interne http://kjorapp.com (protocole différent) -> accepté", () => {
  assert.equal(isSameOrigin(req("http://kjorapp.com/api/x/", { origin: "https://kjorapp.com" })), true);
});

test("en-tête Host public -> accepté", () => {
  assert.equal(isSameOrigin(req("http://localhost:3000/api/x/", { origin: "https://kjorapp.com", host: "kjorapp.com" })), true);
});

test("origine étrangère ou invalide -> refusée (protection CSRF)", () => {
  assert.equal(isSameOrigin(req("https://kjorapp.com/api/x/", { origin: "https://evil.example" })), false);
  assert.equal(isSameOrigin(req("https://kjorapp.com/api/x/", { origin: "https://kjorapp.com.evil.example" })), false);
  assert.equal(isSameOrigin(req("https://kjorapp.com/api/x/", { origin: "null" })), false);
  assert.equal(isSameOrigin(req("https://kjorapp.com/api/x/", { origin: "javascript:alert(1)" })), false);
  assert.equal(isSameOrigin(req("http://localhost:3000/api/x/", { origin: "https://evil.example", "x-forwarded-host": "kjorapp.com" })), false);
});
