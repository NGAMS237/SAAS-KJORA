import "server-only";

import { ROLE_LABELS, type InternalRole } from "@/core/authorization/capabilities";

type InvitationEmailInput = {
  email: string;
  invitationUrl: string;
  language: "fr" | "en";
  organizationName: string;
  role: InternalRole;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] ?? character);
}

export function isTransactionalEmailConfigured() {
  return Boolean(
    process.env.RESEND_TRANSACTIONAL_API_KEY?.trim()
    && process.env.KJORA_TRANSACTIONAL_EMAIL_FROM?.trim(),
  );
}

export async function sendMembershipInvitationEmail(input: InvitationEmailInput) {
  const apiKey = process.env.RESEND_TRANSACTIONAL_API_KEY?.trim();
  const from = process.env.KJORA_TRANSACTIONAL_EMAIL_FROM?.trim();
  if (!apiKey || !from) return false;

  const organization = escapeHtml(input.organizationName);
  const role = escapeHtml(ROLE_LABELS[input.role][input.language]);
  const url = escapeHtml(input.invitationUrl);
  const french = input.language === "fr";
  const subject = french ? `Invitation à rejoindre ${input.organizationName} sur Kjora` : `Invitation to join ${input.organizationName} on Kjora`;
  const html = french
    ? `<h1>Vous êtes invité(e) sur Kjora</h1><p>${organization} vous propose le rôle <strong>${role}</strong>.</p><p><a href="${url}">Examiner et accepter l’invitation</a></p><p>Cette invitation expire dans 7 jours et ne donne aucun accès avant acceptation.</p>`
    : `<h1>You are invited to Kjora</h1><p>${organization} offers you the <strong>${role}</strong> role.</p><p><a href="${url}">Review and accept the invitation</a></p><p>This invitation expires in 7 days and grants no access before acceptance.</p>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [input.email], subject, html }),
    cache: "no-store",
  });
  return response.ok;
}
