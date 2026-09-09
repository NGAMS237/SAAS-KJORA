"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { safeNextPath } from "@/core/auth/safe-next-path";
import { trackEvent } from "@/core/analytics/events";
import type { PlanSlug } from "@/core/entitlements/model";

export function LoginForm({
  nextPath = "/app",
  planRequested = null,
}: {
  nextPath?: string;
  planRequested?: PlanSlug | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const configured = Boolean(getSupabasePublicConfig());

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
      setMessage("Email envoyé. Ouvrez le lien dans ce même navigateur et sur cet appareil, ou saisissez le code reçu.");
    } catch {
      setMessage("Impossible d’envoyer l’accès. Vérifiez l’adresse et réessayez.");
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
      setMessage("Code invalide ou expiré. Demandez un nouvel email d’accès.");
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
            placeholder="vous@exemple.com"
            required
            type="email"
            value={email}
          />
        </label>
        <button className="button button--primary" disabled={!configured || busy} type="submit">
          {busy ? "Envoi…" : sent ? "Renvoyer l’email" : "Recevoir mon accès"}
        </button>
      </form>

      {sent ? (
        <form className="form-stack auth-code-form" onSubmit={verifyCode}>
          <div className="form-separator"><span>Alternative</span></div>
          <label className="field">
            <span>Code reçu par email</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              onChange={(event) => setToken(event.target.value)}
              placeholder="Code à usage unique"
              required
              value={token}
            />
          </label>
          <button className="button button--secondary" disabled={busy} type="submit">
            Vérifier le code
          </button>
        </form>
      ) : null}

      {!configured ? (
        <p className="form-feedback form-feedback--error">La connexion n’est pas encore configurée sur cet environnement.</p>
      ) : message ? <p className="form-feedback" role="status">{message}</p> : null}
    </div>
  );
}
