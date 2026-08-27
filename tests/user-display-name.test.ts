import assert from "node:assert/strict";
import test from "node:test";
import { getUserGreetingName } from "../src/core/auth/user-display-name.ts";

test("dashboard greeting prefers a clean first name", () => {
  assert.equal(getUserGreetingName({ given_name: "blaise" }), "Blaise");
  assert.equal(getUserGreetingName({ full_name: "Blaise Ngams" }), "Blaise");
  assert.equal(getUserGreetingName({ display_name: "Jean-Pierre" }), "Jean-Pierre");
});

test("dashboard greeting never exposes a technical identifier", () => {
  assert.equal(getUserGreetingName({ name: "afterworkquebec2025" }), null);
  assert.equal(getUserGreetingName({ display_name: "owner@example.com" }), null);
  assert.equal(getUserGreetingName({}), null);
  assert.equal(getUserGreetingName(undefined), null);
});
