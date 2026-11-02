// Bibliothèque de messages par occasion — module PUR (aucun accès base).
// Les textes sont des modèles : l'utilisateur les relit et les modifie avant
// d'envoyer. Rien n'est envoyé automatiquement ; WhatsApp et e-mail s'ouvrent
// avec le texte prérempli (lien wa.me / mailto:).

export type MessageTemplate = { key: string; label: string; group: "loyer" | "vie_du_bail" | "occasions"; subject: string; body: string };

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  { key: "rappel_avant", group: "loyer", label: "Rappel avant l’échéance", subject: "Rappel de loyer", body: "Bonjour {prenom}, un petit rappel : votre loyer de {total} pour {logement} est à régler le {jour} de ce mois. Merci d’avance ! {signature}" },
  { key: "retard", group: "loyer", label: "Loyer en retard", subject: "Loyer en attente de règlement", body: "Bonjour {prenom}, sauf erreur de ma part, il reste {du} à régler pour {logement}. Merci de régulariser dès que possible, ou de me prévenir si vous rencontrez une difficulté, nous trouverons une solution. {signature}" },
  { key: "merci_paiement", group: "loyer", label: "Merci pour votre paiement", subject: "Paiement bien reçu", body: "Bonjour {prenom}, nous avons bien reçu votre paiement pour {logement}. Merci beaucoup ! Votre reçu est disponible dans votre portail locataire. {signature}" },
  { key: "quittance", group: "loyer", label: "Quittance disponible", subject: "Votre quittance de loyer", body: "Bonjour {prenom}, votre quittance de loyer pour {logement} est disponible dans votre portail locataire Kjora. {signature}" },
  { key: "bienvenue", group: "vie_du_bail", label: "Bienvenue au nouveau locataire", subject: "Bienvenue", body: "Bonjour {prenom}, bienvenue dans {logement} ! Votre loyer est de {total} par mois, à régler le {jour} de chaque mois. N’hésitez pas à me contacter pour toute question. {signature}" },
  { key: "changement_loyer", group: "vie_du_bail", label: "Changement de loyer", subject: "Changement de loyer", body: "Bonjour {prenom}, je vous informe que le loyer de {logement} passera de {total} à {nouveau_loyer} à partir du {date}. Les échéances déjà émises ne changent pas. {signature}" },
  { key: "fin_bail", group: "vie_du_bail", label: "Fin de bail / préavis", subject: "Fin de votre bail", body: "Bonjour {prenom}, votre bail pour {logement} se termine le {date}. Merci de me contacter afin de planifier l’état des lieux de sortie. {signature}" },
  { key: "travaux", group: "vie_du_bail", label: "Travaux ou intervention", subject: "Information : intervention prévue", body: "Bonjour {prenom}, une intervention est prévue à {logement} le {date}. Merci de votre compréhension. {signature}" },
  { key: "voeux", group: "occasions", label: "Bonne année", subject: "Bonne année", body: "Bonjour {prenom}, je vous souhaite une très belle année, pleine de santé et de réussite. Merci pour votre confiance. {signature}" },
  { key: "fetes", group: "occasions", label: "Joyeuses fêtes", subject: "Joyeuses fêtes", body: "Bonjour {prenom}, je vous souhaite d’excellentes fêtes de fin d’année, en famille et en bonne santé. {signature}" },
  { key: "libre", group: "occasions", label: "Message libre", subject: "", body: "Bonjour {prenom}, {signature}" },
];

export type MessageVariables = Partial<Record<"prenom" | "nom" | "logement" | "loyer" | "charges" | "total" | "du" | "jour" | "date" | "nouveau_loyer" | "signature", string>>;

export function templateByKey(key: string): MessageTemplate {
  return MESSAGE_TEMPLATES.find((item) => item.key === key) ?? MESSAGE_TEMPLATES[0];
}

// Les variables inconnues ou vides restent visibles entre crochets pour être complétées.
export function renderTemplate(body: string, variables: MessageVariables): string {
  return body.replace(/\{([a-z_]+)\}/g, (_match, name: string) => {
    const value = variables[name as keyof MessageVariables];
    return value && value.trim() ? value : `[${name}]`;
  });
}

export function firstName(fullName: string): string {
  const token = fullName.trim().split(/\s+/)[0] ?? "";
  return token ? token.charAt(0).toUpperCase() + token.slice(1).toLowerCase() : "";
}

export function formatXaf(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR").replace(/ /g, " ")} XAF`;
}

// Numéro de téléphone saisi librement -> E.164, ou null si on ne sait pas (l'utilisateur corrige).
export function normalizeTenantPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return /^[1-9][0-9]{7,14}$/.test(digits) ? `+${digits}` : null;
  const international = digits.startsWith("00") ? digits.slice(2) : digits;
  if (international.startsWith("237") && international.length === 12) return `+${international}`;
  if (/^6[0-9]{8}$/.test(international) || /^2[0-9]{8}$/.test(international)) return `+237${international}`;
  if (/^0[789][01][0-9]{8}$/.test(international)) return `+234${international.slice(1)}`;
  return null;
}

export function buildMailtoUrl(email: string, subject: string, body: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
