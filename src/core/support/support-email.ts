import "server-only";

// =============================================================================
// Support bêta — envoi par email, sans persistance
// =============================================================================
// Choix assumé pour la bêta Découverte : aucune table, aucune migration, aucune
// RLS nouvelle. La demande part par email via l'intégration Resend existante.
//
// Minimisation des données : on transmet le strict nécessaire au traitement
// d'une demande — organisation, rôle, email de contact, sujet, message. Aucune
// donnée financière, aucun contenu de bail, aucun secret.
// =============================================================================

import { SUPPORT_CATEGORY_LABELS, type SupportCategory } from "@/core/support/model";

export type SupportRequest = {
  category: SupportCategory;
  message: string;
  replyTo: string;
  organizationName: string;
  organizationId: string;
  role: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] ?? character);
}

export function isSupportEmailConfigured() {
  return Boolean(
    process.env.RESEND_TRANSACTIONAL_API_KEY?.trim()
    && process.env.KJORA_TRANSACTIONAL_EMAIL_FROM?.trim()
    && process.env.KJORA_SUPPORT_EMAIL_TO?.trim(),
  );
}

/** Adresse de destination des demandes de support. */
export function supportInbox() {
  return process.env.KJORA_SUPPORT_EMAIL_TO?.trim() ?? "";
}

export async function sendSupportRequestEmail(input: SupportRequest) {
  const apiKey = process.env.RESEND_TRANSACTIONAL_API_KEY?.trim();
  const from = process.env.KJORA_TRANSACTIONAL_EMAIL_FROM?.trim();
  const to = supportInbox();
  if (!apiKey || !from || !to) return false;

  const category = escapeHtml(SUPPORT_CATEGORY_LABELS[input.category]);
  const organization = escapeHtml(input.organizationName);
  const replyTo = escapeHtml(input.replyTo);
  const role = escapeHtml(input.role);
  const message = escapeHtml(input.message).replace(/\n/g, "<br />");

  const html = `<h1>Demande de support Kjora</h1>
<p><strong>Sujet :</strong> ${category}</p>
<p><strong>Organisation :</strong> ${organization} (<code>${escapeHtml(input.organizationId)}</code>)</p>
<p><strong>Rôle :</strong> ${role}</p>
<p><strong>Répondre à :</strong> ${replyTo}</p>
<hr />
<p>${message}</p>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: input.replyTo,
      subject: `[Support Kjora] ${SUPPORT_CATEGORY_LABELS[input.category]} — ${input.organizationName}`,
      html,
    }),
    cache: "no-store",
  });
  return response.ok;
}
