import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyAuthCallbackFailure,
  createSafeAuthCallbackDiagnostic,
  getAuthCallbackMessage,
  hasPkceVerifierCookie,
} from "../src/core/auth/callback-diagnostics.ts";

test("un callback sans code est classé lien invalide ou expiré", () => {
  assert.equal(classifyAuthCallbackFailure(null, false), "invalid-or-expired-link");
});

test("une expiration confirmée est distinguée d'une erreur d'échange", () => {
  assert.equal(
    classifyAuthCallbackFailure({ code: "flow_state_expired", status: 400 }),
    "invalid-or-expired-link",
  );
  assert.equal(
    classifyAuthCallbackFailure({ name: "AuthPKCECodeVerifierMissingError", status: 400 }),
    "session-exchange-failed",
  );
});

test("le diagnostic ne contient ni message, ni code Auth, ni verifier", () => {
  const diagnostic = createSafeAuthCallbackDiagnostic(
    {
      code: "pkce_code_verifier_missing",
      message: "sensitive-auth-code-and-verifier",
      name: "AuthPKCECodeVerifierMissingError",
      status: 400,
    },
    {
      hasAuthorizationCode: true,
      hasFlowId: false,
      hasPkceVerifier: false,
      host: "localhost:3000",
    },
  );

  assert.equal(JSON.stringify(diagnostic).includes("sensitive-auth-code-and-verifier"), false);
  assert.equal(diagnostic.hasPkceVerifier, false);
});

test("les cookies PKCE sont détectés uniquement par leur nom", () => {
  assert.equal(hasPkceVerifierCookie(["theme", "sb-project-auth-token-code-verifier"]), true);
  assert.equal(hasPkceVerifierCookie(["theme", "sb-project-auth-token"]), false);
});

test("les deux erreurs ont des messages utilisateurs distincts", () => {
  assert.notEqual(
    getAuthCallbackMessage("invalid-or-expired-link"),
    getAuthCallbackMessage("session-exchange-failed"),
  );
});
