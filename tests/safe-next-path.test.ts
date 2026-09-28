import assert from "node:assert/strict";
import test from "node:test";
import { safeNextPath } from "../src/core/auth/safe-next-path.ts";

test("le retour Auth accepte un chemin interne d’invitation", () => {
  assert.equal(safeNextPath("/invitation/accepter"), "/invitation/accepter");
});

test("le retour Auth refuse les redirections externes et protocol-relative", () => {
  assert.equal(safeNextPath("https://evil.example/steal", "https://saas-kjora.vercel.app"), "/app");
  assert.equal(safeNextPath("//evil.example/steal"), "/app");
});

test("le retour Auth refuse les séparateurs masqués par le parseur URL", () => {
  const hostilePaths = [
    "/\t//evil.example/steal",
    "/\n//evil.example/steal",
    "/\r//evil.example/steal",
    "/%09//evil.example/steal",
    "/%5cevil.example/steal",
  ];

  for (const hostile of hostilePaths) {
    const result = safeNextPath(hostile, "https://saas-kjora.vercel.app");
    assert.equal(result, "/app", hostile);
    assert.equal(new URL(result, "https://saas-kjora.vercel.app").origin, "https://saas-kjora.vercel.app");
  }
});

test("le retour Auth normalise un chemin interne sans changer d'origine", () => {
  assert.equal(safeNextPath("/invitation/accepter?token=abc", "https://saas-kjora.vercel.app"), "/invitation/accepter?token=abc");
  assert.equal(safeNextPath("/invitation/accepter#fragment", "https://saas-kjora.vercel.app"), "/invitation/accepter");
  assert.equal(safeNextPath("invitation/accepter", "https://saas-kjora.vercel.app"), "/app");
});

test("le retour Auth accepte une URL absolue du même domaine", () => {
  assert.equal(
    safeNextPath("https://saas-kjora.vercel.app/invitation/accepter", "https://saas-kjora.vercel.app"),
    "/invitation/accepter",
  );
});
