type UserMetadata = Record<string, unknown>;

const NAME_FIELDS = ["given_name", "first_name", "full_name", "name", "display_name"] as const;

function cleanName(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 80 || /\d|@/.test(normalized)) return null;
  if (!/^[\p{L}\p{M}'’ -]+$/u.test(normalized)) return null;
  const firstName = normalized.split(" ")[0];
  return firstName.charAt(0).toLocaleUpperCase("fr-FR") + firstName.slice(1);
}

export function getUserGreetingName(metadata: UserMetadata | null | undefined, email?: string | null) {
  if (metadata) {
    for (const field of NAME_FIELDS) {
      const name = cleanName(metadata[field]);
      if (name) return name;
    }
  }
  // Repli : partie locale de l'adresse courriel (« jean.tremblay@… » -> « Jean »).
  if (email) return cleanName(email.split("@")[0].split(/[._+-]/)[0]);
  return null;
}
