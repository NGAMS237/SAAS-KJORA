import assert from "node:assert/strict";
import test from "node:test";

import { getPublicRequestOrigin } from "../src/core/routing/public-origin.ts";

test("derrière le proxy Hostinger, l'origine publique est kjorapp.com", () => {
  const headers = new Headers({ "x-forwarded-host": "kjorapp.com" });
  assert.equal(getPublicRequestOrigin({ headers, url: "http://0.0.0.0:3000/api/x" }), "https://kjorapp.com");
  assert.equal(getPublicRequestOrigin({ headers: new Headers(), url: "http://0.0.0.0:3000/api/x" }), "https://kjorapp.com");
});

test("en local, l'origine de la requête est conservée", () => {
  assert.equal(getPublicRequestOrigin({ headers: new Headers(), url: "http://localhost:3000/api/x" }), "http://localhost:3000");
});
