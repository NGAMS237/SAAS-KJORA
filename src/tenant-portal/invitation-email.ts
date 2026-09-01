import "server-only";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export async function sendTenantPortalInvitationEmail(input: {
  email: string;
  invitationUrl: string;
  language: "fr" | "en";
  organizationName: string;
}) {
  const apiKey = process.env.RESEND_TRANSACTIONAL_API_KEY?.trim();
  const from = process.env.KJORA_TRANSACTIONAL_EMAIL_FROM?.trim();
  if (!apiKey || !from) return false;
  const organization = escapeHtml(input.organizationName);
  const url = escapeHtml(input.invitationUrl);
  const french = input.language === "fr";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from, to: [input.email],
      subject: french ? `Votre accès locataire ${input.organizationName}` : `Your ${input.organizationName} tenant access`,
      html: french
        ? `<h1>Votre espace locataire Kjora</h1><p>${organization} vous invite à consulter votre location.</p><p><a href="${url}">Activer mon accès sécurisé</a></p><p>Cette invitation expire dans 7 jours. Aucune information financière n’est incluse dans cet email.</p>`
        : `<h1>Your Kjora tenant space</h1><p>${organization} invites you to view your lease.</p><p><a href="${url}">Activate my secure access</a></p><p>This invitation expires in 7 days. No financial information is included in this email.</p>`,
    }), cache: "no-store",
  });
  return response.ok;
}
