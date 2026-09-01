"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/core/auth/safe-next-path";

export function PortalLoginForm({ language = "fr", nextPath = "/portal/auth/complete" }: { language?: "fr" | "en"; nextPath?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const t = (fr: string, en: string) => language === "en" ? en : fr;

  async function send(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("next", safeNextPath(nextPath));
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callback.toString() } });
      if (error) throw error;
      setSent(true);
      setMessage(t("Email envoyé. Ouvrez le lien sur ce même appareil ou saisissez le code reçu.", "Email sent. Open the link on this device or enter the code you received."));
    } catch {
      setMessage(t("Impossible d’envoyer l’accès. Vérifiez l’adresse et réessayez.", "Unable to send access. Check the address and try again."));
    } finally { setBusy(false); }
  }

  async function verify(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.verifyOtp({ email, token: token.trim(), type: "email" });
      if (error) throw error;
      // An invited identity has no active TenantPortalAccess yet. Let it reach the
      // acceptance screen first; established portal users must establish the
      // bounded portal session before any read route is opened.
      if (!safeNextPath(nextPath).startsWith("/portal/invitation/accepter")) {
        const session = await fetch("/api/tenant-portal/session", { method: "POST" });
        if (!session.ok) throw new Error("portal_access_required");
      }
      router.replace(safeNextPath(nextPath)); router.refresh();
    } catch {
      setMessage(t("Code invalide ou expiré. Demandez un nouvel email d’accès.", "Invalid or expired code. Request a new access email."));
    } finally { setBusy(false); }
  }

  return <div className="auth-form-stack"><form className="form-stack" onSubmit={send}><label className="field"><span>Email</span><input autoComplete="email" inputMode="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("vous@exemple.com", "you@example.com")} /></label><button className="button button--primary" disabled={busy} type="submit">{busy ? t("Envoi…", "Sending…") : sent ? t("Renvoyer l’email", "Resend email") : t("Recevoir mon accès", "Get access")}</button></form>{sent ? <form className="form-stack auth-code-form" onSubmit={verify}><div className="form-separator"><span>{t("Alternative", "Alternative")}</span></div><label className="field"><span>{t("Code reçu par email", "Code received by email")}</span><input autoComplete="one-time-code" inputMode="numeric" required value={token} onChange={(event) => setToken(event.target.value)} /></label><button className="button button--secondary" disabled={busy} type="submit">{t("Vérifier le code", "Verify code")}</button></form> : null}{message ? <p className="form-feedback" role="status">{message}</p> : null}</div>;
}
