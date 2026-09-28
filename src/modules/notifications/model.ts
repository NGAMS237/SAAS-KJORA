// =============================================================================
// KJORA — NOTIFICATIONS-COMMUNICATIONS-E2E-01 — Notifications (module pur)
// =============================================================================
// Aucune dépendance serveur/navigateur : testable directement par Node.
//
// Destinations FERMÉES : une destination n'est jamais construite depuis le
// payload d'une notification. Elle dérive uniquement de la réponse de
// public.open_notification, qui ne renvoie que des identifiants RE-VÉRIFIÉS en
// base (existence, Organization, capacité, document non invalidé). Chaque
// identifiant est encore validé ici (UUID strict) avant d'entrer dans une URL :
// une réponse inattendue retombe sur un repli, jamais sur une URL arbitraire.
//
// Repli : jamais un 404 générique ni l'écran « Ressource introuvable ». Le
// centre de notifications s'ouvre avec un message non bloquant (?notice=…).
// =============================================================================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const NOTIFICATION_TYPES = [
  "due_notice_ready",
  "payment_receipt_ready",
  "rent_receipt_ready",
  "payment_overdue",
  "last_prepaid_period",
  "low_credit",
  "delivery_failed",
  "contract_ready",
  "contract_completed",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Réponse de public.open_notification (seuls ces champs sont lus). */
export type NotificationOpenResult = {
  found: boolean;
  organization_id?: string | null;
  notification_type?: string | null;
  document_id?: string | null;
  tenant_id?: string | null;
  lease_id?: string | null;
  can_view_payments?: boolean | null;
  can_view_contracts?: boolean | null;
};

export const NOTIFICATION_NOTICES = [
  "notification_unavailable",
  "resource_unavailable",
  "other_organization",
] as const;
export type NotificationNotice = (typeof NOTIFICATION_NOTICES)[number];

export function parseNotificationNotice(value: unknown): NotificationNotice | null {
  return typeof value === "string" && (NOTIFICATION_NOTICES as readonly string[]).includes(value)
    ? value as NotificationNotice
    : null;
}

export const NOTIFICATION_CENTER = "/app/activite";

export function notificationFallbackHref(notice: NotificationNotice): string {
  return `${NOTIFICATION_CENTER}?notice=${notice}#notifications`;
}

export type NotificationDestination = {
  href: string;
  /** Vrai si la destination est le repli (ressource absente/inaccessible). */
  fallback: boolean;
};

function id(value: unknown): string | null {
  return isUuid(value) ? value.toLowerCase() : null;
}

/**
 * Résout la destination d'une notification ouverte. `activeOrganizationId` :
 * une notification d'une autre Organization que l'active ne mène jamais à ses
 * ressources (repli explicite, sans rien révéler).
 */
export function resolveNotificationDestination(
  result: NotificationOpenResult | null | undefined,
  activeOrganizationId: string,
): NotificationDestination {
  if (!result || result.found !== true || !isNotificationType(result.notification_type)) {
    return { href: notificationFallbackHref("notification_unavailable"), fallback: true };
  }
  if (!isUuid(result.organization_id) || result.organization_id.toLowerCase() !== activeOrganizationId.toLowerCase()) {
    return { href: notificationFallbackHref("other_organization"), fallback: true };
  }

  const documentId = id(result.document_id);
  const tenantId = id(result.tenant_id);
  const leaseId = id(result.lease_id);
  const canViewPayments = result.can_view_payments === true;
  const canViewContracts = result.can_view_contracts === true;

  const document = documentId ? `/api/financial-documents/${documentId}/download` : null;
  const tenant = tenantId ? `/app/locataires/${tenantId}` : null;
  const tenantDocuments = tenantId ? `/app/locataires/${tenantId}#documents` : null;
  const statement = tenantId ? `/app/locataires/${tenantId}/etat-de-compte` : null;
  const lease = leaseId ? `/app/locations/${leaseId}` : null;
  const contract = leaseId && canViewContracts ? `/app/locations/${leaseId}/contrat` : null;
  const paymentsForLease = canViewPayments
    ? leaseId ? `/app/paiements?lease=${leaseId}` : tenantId ? `/app/paiements?tenant=${tenantId}` : null
    : null;

  let href: string | null;
  switch (result.notification_type) {
    case "due_notice_ready":
    case "payment_receipt_ready":
    case "rent_receipt_ready":
      href = document ?? tenantDocuments ?? lease;
      break;
    case "payment_overdue":
      href = paymentsForLease ?? statement ?? lease;
      break;
    case "low_credit":
      href = statement ?? paymentsForLease ?? lease;
      break;
    case "last_prepaid_period":
      href = paymentsForLease ?? lease ?? statement;
      break;
    case "delivery_failed":
      href = tenantDocuments ?? lease;
      break;
    case "contract_ready":
    case "contract_completed":
      href = contract ?? lease ?? tenant;
      break;
    default:
      href = null;
  }
  return href && isSafeInternalPath(href)
    ? { href, fallback: false }
    : { href: notificationFallbackHref("resource_unavailable"), fallback: true };
}

/** Chemin interne strict : jamais une URL absolue, protocol-relative ou échappée. */
export function isSafeInternalPath(path: string): boolean {
  return /^\/(app|api)\/[A-Za-z0-9\-_/?=#&.]*$/.test(path) && !path.startsWith("//") && !path.includes("..");
}

/**
 * Navigation autorisée à ÉCRIRE (marquer lue) ? Uniquement « same-origin »
 * (lien interne) et « none » (saisie directe, favori). Tout le reste refuse
 * l'écriture — y compris un en-tête ABSENT (fail-closed : navigateur ancien,
 * proxy ou client non navigateur dont l'origine ne peut pas être établie).
 */
export function isTrustedOpenNavigation(secFetchSite: string | null | undefined): boolean {
  return secFetchSite === "same-origin" || secFetchSite === "none";
}

/**
 * Traitement d'une ouverture selon Sec-Fetch-Site :
 *   open   : écriture (lue) + destination — navigation de confiance ;
 *   peek   : destination SANS écriture — en-tête absent (fail-closed pour
 *            l'écriture ; la lecture reste gardée en base par la capacité) ;
 *   reject : aucune lecture, aucune écriture — navigation venue d'un autre
 *            site (cross-site, same-site) ou valeur inconnue.
 * Le marquage « lue » des navigateurs sans en-tête passe par la Server
 * Action déclenchée au clic (POST, contrôle d'origine intégré à Next).
 */
export function notificationOpenMode(secFetchSite: string | null | undefined): "open" | "peek" | "reject" {
  if (isTrustedOpenNavigation(secFetchSite)) return "open";
  if (secFetchSite === null || secFetchSite === undefined || secFetchSite === "") return "peek";
  return "reject";
}

// -----------------------------------------------------------------------------
// Libellés FR/EN — distinguer des alertes répétées (locataire, logement,
// référence, date), jamais une adresse électronique.
// -----------------------------------------------------------------------------

export type NotificationLanguage = "FR" | "EN";

export type NotificationDisplayInput = {
  type: NotificationType;
  payload: Record<string, unknown>;
  tenantName?: string | null;
  propertyName?: string | null;
  unitLabel?: string | null;
  createdAt: string;
};

const TITLES: Record<NotificationType, [string, string]> = {
  due_notice_ready: ["Avis d’échéance prêt", "Due notice ready"],
  payment_receipt_ready: ["Reçu de paiement prêt", "Payment receipt ready"],
  rent_receipt_ready: ["Quittance de loyer prête", "Rent receipt ready"],
  payment_overdue: ["Échéance en retard", "Payment overdue"],
  contract_ready: ["Contrat à consulter", "Contract ready"],
  contract_completed: ["Contrat final disponible", "Final contract available"],
  last_prepaid_period: ["Dernière période prépayée atteinte", "Last prepaid period reached"],
  low_credit: ["Crédit insuffisant pour la prochaine échéance", "Credit does not cover the next due"],
  delivery_failed: ["Échec d’envoi", "Delivery failed"],
};

const EMAIL_LIKE = /[^\s@]+@[^\s@]+/;

function safeText(value: unknown, max = 80): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const text = String(value).trim();
  if (!text || EMAIL_LIKE.test(text)) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function formatNotificationDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function amount(value: unknown, language: NotificationLanguage): string {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString(language === "FR" ? "fr-FR" : "en-GB");
}

export type NotificationDisplay = {
  title: string;
  /** Qui/où : locataire · bien · logement. */
  context: string;
  /** Quoi : référence, montant ou période, selon le type. */
  detail: string;
  /** Date de l'alerte (JJ/MM/AAAA). */
  date: string;
  /** Libellé accessible complet, état lu/non lu compris. */
  ariaLabel: (isRead: boolean) => string;
};

export function notificationDisplay(input: NotificationDisplayInput, language: NotificationLanguage): NotificationDisplay {
  const fr = language === "FR";
  const t = (frText: string, enText: string) => fr ? frText : enText;
  const [titleFr, titleEn] = TITLES[input.type];
  const title = fr ? titleFr : titleEn;

  const unit = [safeText(input.propertyName), safeText(input.unitLabel)].filter(Boolean).join(" · ");
  const context = [safeText(input.tenantName), unit].filter(Boolean).join(" — ");

  const reference = safeText(input.payload.payment_reference ?? input.payload.due_reference ?? input.payload.reference);
  const dueDate = formatNotificationDate(input.payload.due_date ?? input.payload.next_uncovered_due_date);
  let detail: string;
  switch (input.type) {
    case "low_credit":
      detail = t(
        `Crédit affecté : ${amount(input.payload.credit_applied_xaf, language)} XAF · Reste attendu : ${amount(input.payload.expected_remainder_xaf, language)} XAF`,
        `Credit applied: ${amount(input.payload.credit_applied_xaf, language)} XAF · Expected remainder: ${amount(input.payload.expected_remainder_xaf, language)} XAF`,
      );
      break;
    case "last_prepaid_period":
      detail = t(
        `Dernière période couverte : ${formatNotificationDate(input.payload.last_covered_period_end) || "—"} · Prochaine échéance non couverte : ${formatNotificationDate(input.payload.next_uncovered_due_date) || "—"}`,
        `Last covered period: ${formatNotificationDate(input.payload.last_covered_period_end) || "—"} · Next uncovered due: ${formatNotificationDate(input.payload.next_uncovered_due_date) || "—"}`,
      );
      break;
    case "payment_overdue":
      detail = [
        reference,
        dueDate ? t(`échéance du ${dueDate}`, `due ${dueDate}`) : "",
        input.payload.remaining_xaf !== undefined ? t(`reste ${amount(input.payload.remaining_xaf, language)} XAF`, `${amount(input.payload.remaining_xaf, language)} XAF left`) : "",
      ].filter(Boolean).join(" · ");
      break;
    default:
      detail = [reference, dueDate ? t(`échéance du ${dueDate}`, `due ${dueDate}`) : ""].filter(Boolean).join(" · ");
  }
  if (!detail) detail = t("Événement financier", "Financial event");

  const date = formatNotificationDate(input.createdAt);
  return {
    title,
    context,
    detail,
    date,
    ariaLabel: (isRead) => [
      isRead ? t("Lue", "Read") : t("Non lue", "Unread"),
      title,
      context,
      detail,
      date,
    ].filter(Boolean).join(", "),
  };
}

// -----------------------------------------------------------------------------
// État lu/non lu optimiste (badge immédiat)
// -----------------------------------------------------------------------------

export type ReadableNotification = { id: string; readAt: string | null };

/** Applique des surcharges locales (id → lu ?) sans muter la liste reçue. */
export function applyReadOverrides<T extends ReadableNotification>(
  notifications: readonly T[],
  overrides: ReadonlyMap<string, boolean>,
  nowIso: string,
): T[] {
  if (overrides.size === 0) return [...notifications];
  return notifications.map((notification) => {
    const override = overrides.get(notification.id);
    if (override === undefined) return notification;
    if (override && !notification.readAt) return { ...notification, readAt: nowIso };
    if (!override && notification.readAt) return { ...notification, readAt: null };
    return notification;
  });
}

export function unreadCount(notifications: readonly ReadableNotification[]): number {
  return notifications.reduce((total, notification) => total + (notification.readAt ? 0 : 1), 0);
}

/** Libellé du badge : jamais plus de « 99+ ». */
export function badgeLabel(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? "99+" : String(Math.floor(count));
}

// -----------------------------------------------------------------------------
// Erreurs : codes stables, jamais un error.message brut
// -----------------------------------------------------------------------------

export type NotificationActionError = "unauthenticated" | "forbidden" | "invalid_notification" | "organization_unavailable" | "failed";

export function mapNotificationRpcError(error: { code?: string | null } | null | undefined): NotificationActionError {
  if (!error) return "failed";
  if (error.code === "42501") return "forbidden";
  if (error.code === "22023" || error.code === "22P02") return "invalid_notification";
  return "failed";
}

export function notificationActionMessage(code: NotificationActionError, language: NotificationLanguage): string {
  const fr = language === "FR";
  switch (code) {
    case "unauthenticated": return fr ? "Votre session a expiré. Reconnectez-vous." : "Your session has expired. Please sign in again.";
    case "forbidden": return fr ? "Cette notification n’est plus accessible." : "This notification is no longer accessible.";
    case "invalid_notification": return fr ? "Notification introuvable." : "Notification not found.";
    case "organization_unavailable": return fr ? "Cette Organization n’est pas active." : "This Organization is not active.";
    default: return fr ? "Impossible de mettre à jour la notification. Réessayez." : "Unable to update the notification. Please try again.";
  }
}

export function notificationNoticeMessage(notice: NotificationNotice, language: NotificationLanguage): string {
  const fr = language === "FR";
  switch (notice) {
    case "resource_unavailable":
      return fr
        ? "L’élément lié à cette notification n’est plus disponible ou ne vous est plus accessible. La notification a été marquée comme lue."
        : "The item linked to this notification is no longer available or accessible to you. The notification has been marked as read.";
    case "other_organization":
      return fr
        ? "Cette notification concerne une autre Organization. Changez d’Organization active pour la consulter."
        : "This notification belongs to another Organization. Switch the active Organization to view it.";
    default:
      return fr
        ? "Cette notification n’est plus disponible."
        : "This notification is no longer available.";
  }
}
