"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { safeNextPath } from "@/core/auth/safe-next-path";
import { trackEvent } from "@/core/analytics/events";
import type { PlanSlug } from "@/core/entitlements/model";
import type { SiteAppLocale } from "@/core/onboarding/plan-intent";

export function LoginForm({
  nextPath = "/app",
  planRequested = null,
  locale = "fr",
}: {
  nextPath?: string;
  planRequested?: PlanSlug | null;
  locale?: SiteAppLocale;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const configured = Boolean(getSupabasePublicConfig());
  const t = (fr: string, en: string) => locale === "en" ? en : fr;

  // ALIGN-02 §16 — début du parcours d'authentification
  useEffect(() => {
    trackEvent("auth_started", { plan_requested: planRequested });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", safeNextPath(nextPath));
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callbackUrl.toString(),
        },
      });
      if (error) throw error;
      trackEvent("magic_link_sent", { plan_requested: planRequested });
      setSent(true);
      setMessage(locale === "en"
        ? "Email sent. Open the link in this browser and on this device, or enter the code you received."
        : "Email envoyé. Ouvrez le lien dans ce même navigateur et sur cet appareil, ou saisissez le code reçu.");
    } catch {
      setMessage(locale === "en" ? "Unable to send access. Check the address and try again." : "Impossible d’envoyer l’accès. Vérifiez l’adresse et réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.verifyOtp({ email, token: token.trim(), type: "email" });
      if (error) throw error;
      router.replace(safeNextPath(nextPath));
      router.refresh();
    } catch {
      setMessage(locale === "en" ? "Invalid or expired code. Request a new access email." : "Code invalide ou expiré. Demandez un nouvel email d’accès.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-form-stack">
      <form className="form-stack" onSubmit={sendAccess}>
        <label className="field">
          <span>Email</span>
          <input
            autoComplete="email"
            disabled={!configured || busy}
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder={locale === "en" ? "you@example.com" : "vous@exemple.com"}
            required
            type="email"
            value={email}
          />
        </label>
        <button className="button button--primary" disabled={!configured || busy} type="submit">
          {busy ? t("Envoi…", "Sending…") : sent ? t("Renvoyer l’email", "Send email again") : t("Recevoir mon accès", "Send my access link")}
        </button>
      </form>

      {sent ? (
        <form className="form-stack auth-code-form" onSubmit={verifyCode}>
          <div className="form-separator"><span>{t("Alternative", "Alternative")}</span></div>
          <label className="field">
            <span>{t("Code reçu par email", "Code received by email")}</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              onChange={(event) => setToken(event.target.value)}
              placeholder={t("Code à usage unique", "One-time code")}
              required
              value={token}
            />
          </label>
          <button className="button button--secondary" disabled={busy} type="submit">
            {t("Vérifier le code", "Verify code")}
          </button>
        </form>
      ) : null}

      {!configured ? (
        <p className="form-feedback form-feedback--error">{t("La connexion n’est pas encore configurée sur cet environnement.", "Sign-in is not configured in this environment yet.")}</p>
      ) : message ? <p className="form-feedback" role="status">{message}</p> : null}
    </div>
  );
}
