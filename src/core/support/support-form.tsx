"use client";

import { FormEvent, useState } from "react";
import { LifeBuoy, MailCheck } from "lucide-react";
import { SUPPORT_CATEGORIES, SUPPORT_CATEGORY_LABELS, type SupportCategory } from "@/core/support/model";

type Etat = "saisie" | "envoi" | "recu";

export function SupportForm({ contactEmail }: { contactEmail: string | null }) {
  const [etat, setEtat] = useState<Etat>("saisie");
  const [category, setCategory] = useState<SupportCategory>("connexion");
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEtat("envoi");
    setErreur(null);

    const response = await fetch("/api/support", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category, message: message.trim() }),
    });

    if (response.ok) {
      setEtat("recu");
      return;
    }

    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setErreur(
      body?.error === "support_email_not_configured"
        ? "L’envoi de demandes n’est pas encore activé sur cet environnement. Écrivez-nous directement depuis votre messagerie."
        : body?.error === "invalid_message"
          ? "Votre message doit faire au moins quelques mots pour que nous puissions vous aider."
          : "Nous n’avons pas pu transmettre votre demande. Réessayez dans un instant.",
    );
    setEtat("saisie");
  }

  if (etat === "recu") {
    return (
      <div className="support-ack" role="status">
        <MailCheck size={22} aria-hidden="true" />
        <h2>Votre demande est bien arrivée.</h2>
        <p>
          Nous vous répondrons{contactEmail ? <> à <strong>{contactEmail}</strong></> : null}. Pendant la
          bêta, comptez généralement un jour ouvré.
        </p>
        <button className="button button--secondary" onClick={() => { setMessage(""); setEtat("saisie"); }} type="button">
          Envoyer une autre demande
        </button>
      </div>
    );
  }

  return (
    <form className="form-stack" onSubmit={envoyer}>
      <label className="field">
        <span>De quoi s’agit-il ?</span>
        <select
          name="category"
          onChange={(event) => setCategory(event.target.value as SupportCategory)}
          value={category}
        >
          {SUPPORT_CATEGORIES.map((valeur) => (
            <option key={valeur} value={valeur}>{SUPPORT_CATEGORY_LABELS[valeur]}</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Votre message</span>
        <textarea
          maxLength={4000}
          minLength={10}
          name="message"
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Décrivez ce que vous tentiez de faire et ce qui s’est passé."
          required
          rows={7}
          value={message}
        />
        <small>
          Nous transmettons votre organisation, votre rôle et votre email de contact. N’indiquez ici aucun
          mot de passe ni code reçu par email.
        </small>
      </label>

      {erreur ? <p className="form-feedback form-feedback--error" role="alert">{erreur}</p> : null}

      <button className="button button--primary" disabled={etat === "envoi" || message.trim().length < 10} type="submit">
        <LifeBuoy size={17} aria-hidden="true" />
        {etat === "envoi" ? "Envoi…" : "Envoyer ma demande"}
      </button>
    </form>
  );
}
