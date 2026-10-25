import assert from "node:assert/strict";
import test from "node:test";
import { getPublicRequestOrigin } from "../src/core/routing/public-origin.ts";

test("Hostinger redirects use the trusted public KJORA origin", () => {
  assert.equal(
    getPublicRequestOrigin({
      headers: new Headers({ "x-forwarded-host": "kjorapp.com", "x-forwarded-proto": "https" }),
      nextUrl: new URL("http://0.0.0.0:3000/auth/callback?code=redacted"),
    }),
    "https://kjorapp.com",
  );
});

test("Hostinger's internal listener never leaks into a browser redirect", () => {
  assert.equal(
    getPublicRequestOrigin({
      headers: new Headers(),
      nextUrl: new URL("http://0.0.0.0:3000/auth/callback?code=redacted"),
    }),
    "https://kjorapp.com",
  );
});

test("local and preview requests keep their own origin", () => {
  assert.equal(
    getPublicRequestOrigin({ headers: new Headers(), nextUrl: new URL("http://localhost:3000/connexion") }),
    "http://localhost:3000",
  );
});
