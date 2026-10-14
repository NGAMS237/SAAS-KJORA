import assert from "node:assert/strict";
import test from "node:test";

import { isSameOriginRequest } from "../src/core/http/same-origin.ts";

function request(url: string, origin?: string) {
  return new Request(url, { headers: origin ? { origin } : undefined });
}

function withAppOrigin(value: string, check: () => void) {
  const previous = process.env.KJORA_APP_ORIGIN;
  process.env.KJORA_APP_ORIGIN = value;
  try {
    check();
  } finally {
    if (previous === undefined) delete process.env.KJORA_APP_ORIGIN;
    else process.env.KJORA_APP_ORIGIN = previous;
  }
}

test("same-origin direct reste accepté", () => {
  assert.equal(isSameOriginRequest(request("https://kjorapp.com/api/onboarding/", "https://kjorapp.com")), true);
  assert.equal(isSameOriginRequest(request("http://127.0.0.1:3000/api/onboarding/", "http://127.0.0.1:3000")), true);
});

test("origine publique configurée acceptée derrière le proxy Hostinger", () => {
  withAppOrigin("https://kjorapp.com", () => {
    assert.equal(isSameOriginRequest(request("http://0.0.0.0:3000/api/onboarding/", "https://kjorapp.com")), true);
  });
});

test("origine hostile refusée même si elle fournit des en-têtes proxy", () => {
  withAppOrigin("https://kjorapp.com", () => {
    const hostile = new Request("http://0.0.0.0:3000/api/onboarding/", {
      headers: {
        origin: "https://evil.example",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
      },
    });
    assert.equal(isSameOriginRequest(hostile), false);
  });
});

test("configuration publique malformée est ignorée", () => {
  withAppOrigin("https://kjorapp.com/unexpected-path", () => {
    assert.equal(isSameOriginRequest(request("http://0.0.0.0:3000/api/onboarding/", "https://kjorapp.com")), false);
  });
  withAppOrigin("http://kjorapp.com", () => {
    assert.equal(isSameOriginRequest(request("http://0.0.0.0:3000/api/onboarding/", "http://kjorapp.com")), false);
  });
});

test("requête sans Origin conserve le comportement serveur existant", () => {
  assert.equal(isSameOriginRequest(request("https://kjorapp.com/api/onboarding/")), true);
});
