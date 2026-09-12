export type AuthCallbackReason =
  | "invalid-or-expired-link"
  | "session-exchange-failed";

type AuthErrorShape = {
  code?: unknown;
  name?: unknown;
  status?: unknown;
};

const INVALID_OR_EXPIRED_CODES = new Set([
  "flow_state_expired",
  "flow_state_not_found",
  "otp_expired",
]);

export function classifyAuthCallbackFailure(
  error: unknown,
  hasAuthorizationCode = true,
): AuthCallbackReason {
  if (!hasAuthorizationCode) return "invalid-or-expired-link";

  const code = getSafeString((error as AuthErrorShape | null)?.code);
  return code && INVALID_OR_EXPIRED_CODES.has(code)
    ? "invalid-or-expired-link"
    : "session-exchange-failed";
}

export function hasPkceVerifierCookie(cookieNames: string[]) {
  return cookieNames.some((name) => name.includes("code-verifier"));
}

export function getAuthCallbackMessage(reason?: string, locale: "fr" | "en" = "fr") {
  if (reason === "invalid-or-expired-link") {
    return locale === "en"
      ? "This link is invalid, expired, or has already been used. Request a new access email."
      : "Ce lien est invalide, expiré ou a déjà été utilisé. Demandez un nouvel email d’accès.";
  }

  if (reason === "session-exchange-failed") {
    return locale === "en"
      ? "The link was verified, but Kjora could not create the session. Open the new email in the same browser and on the same device, or use the code you received."
      : "Le lien a été vérifié, mais Kjora n’a pas pu créer la session. Ouvrez le nouvel email dans le même navigateur et sur le même appareil, ou utilisez le code reçu.";
  }

  return null;
}

export function createSafeAuthCallbackDiagnostic(
  error: unknown,
  context: {
    hasAuthorizationCode: boolean;
    hasFlowId: boolean;
    hasPkceVerifier: boolean;
    host: string;
  },
) {
  const shaped = (error ?? {}) as AuthErrorShape;
  return {
    event: "auth_callback_exchange_failed",
    reason: classifyAuthCallbackFailure(error, context.hasAuthorizationCode),
    errorName: getSafeString(shaped.name),
    errorCode: getSafeString(shaped.code),
    errorStatus: typeof shaped.status === "number" ? shaped.status : undefined,
    ...context,
  };
}

function getSafeString(value: unknown) {
  return typeof value === "string" && value.length <= 80 ? value : undefined;
}
