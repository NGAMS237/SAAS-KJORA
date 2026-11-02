"use client";

import Link from "next/link";
import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, Banknote, Building2, CalendarClock,
  CircleDollarSign, Clock3, Gauge, History, ListFilter, ShieldCheck, WalletCards,
} from "lucide-react";
import { usePreferences } from "@/core/preferences/preferences-provider";
import { Badge, Card, EmptyState, FinancialStateCard } from "@/core/ui/ui";
import { NotificationsView } from "@/modules/documents/views";
import type { NotificationSummary } from "@/modules/documents/model";
import type {
  ActivityEvent, AuditEntry, AuditFilters, DashboardPeriod, OperationalDashboard, OperationalHealth,
} from "@/modules/operations/model";
import { activityHref, shiftDashboardPeriod } from "@/modules/operations/model";

function useCopy() {
  const { language } = usePreferences();
  return (fr: string, en: string) => language === "FR" ? fr : en;
}

function money(value: number | null, language: "FR" | "EN") {
  if (value === null) return "—";
  return `${value.toLocaleString(language === "FR" ? "fr-FR" : "en-GB")} XAF`;
}

function dateTime(value: string, language: "FR" | "EN") {
  return new Intl.DateTimeFormat(language === "FR" ? "fr-FR" : "en-GB", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value));
}

function monthLabel(period: DashboardPeriod, language: "FR" | "EN") {
  return new Intl.DateTimeFormat(language === "FR" ? "fr-FR" : "en-GB", {
    month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${period.from}T00:00:00Z`));
}

function activityCopy(event: ActivityEvent, t: ReturnType<typeof useCopy>) {
  const labels: Record<string, [string, string]> = {
    PROPERTY_CREATED: ["Bien créé", "Property created"],
    TENANT_CREATED: ["Locataire créé", "Tenant created"],
    LEASE_ACTIVATED: ["Bail activé", "Lease activated"],
    LEASE_LEDGER_OPENED: ["Compte locatif ouvert", "Rental ledger opened"],
    DUE_GENERATED: ["Échéance générée", "Due generated"],
    DUE_ADJUSTED: ["Échéance ajustée", "Due adjusted"],
    PAYMENT_RECORDED: ["Paiement enregistré", "Payment recorded"],
    PAYMENT_COMPLETED: ["Paiement confirmé", "Payment confirmed"],
    PAYMENT_ALLOCATION_CONFIRMED: ["Paiement affecté", "Payment allocated"],
    PAYMENT_REVERSED: ["Paiement extourné", "Payment reversed"],
    DOCUMENT_GENERATED: ["Document généré", "Document generated"],
    DOCUMENT_INVALIDATED: ["Document invalidé", "Document invalidated"],
    MESSAGE_DELIVERY_FAILED: ["Envoi en échec", "Delivery failed"],
  };
  const [fr, en] = labels[event.type] ?? ["Activité Kjora", "Kjora activity"];
  return t(fr, en);
}

function auditCopy(action: string, t: ReturnType<typeof useCopy>) {
  const labels: Record<string, [string, string]> = {
    "member.invited": ["Membre invité", "Member invited"],
    "member.invitation_resent": ["Invitation relancée", "Invitation resent"],
    "member.invitation_revoked": ["Invitation révoquée", "Invitation revoked"],
    "member.invitation_accepted": ["Invitation acceptée", "Invitation accepted"],
    "member.role_changed": ["Rôle modifié", "Role changed"],
    "member.revoked": ["Membre révoqué", "Member revoked"],
    "owner.transferred": ["Propriété transférée", "Ownership transferred"],
    "payment.reversed": ["Paiement extourné", "Payment reversed"],
    "document.invalidated": ["Document invalidé", "Document invalidated"],
  };
  const [fr, en] = labels[action] ?? [action, action];
  return t(fr, en);
}

function auditContext(entry: AuditEntry, t: ReturnType<typeof useCopy>) {
  const reference = typeof entry.details.reference === "string" ? entry.details.reference
    : typeof entry.details.aggregate_id === "string" ? entry.details.aggregate_id : null;
  const reason = typeof entry.details.reason === "string" ? entry.details.reason : null;
  const entity = entry.action.startsWith("payment.") ? t("Paiement", "Payment")
    : entry.action.startsWith("document.") ? t("Document", "Document")
      : t("Membership", "Membership");
  return [entity, reference, reason].filter(Boolean).join(" · ");
}

export function DashboardOperationalView({
  organizationName, greetingName, period, dashboard, activity,
}: {
  organizationName: string;
  greetingName: string | null;
  period: DashboardPeriod;
  dashboard: OperationalDashboard;
  activity: ActivityEvent[];
}) {
  const { language } = usePreferences();
  const t = useCopy();
  const previous = shiftDashboardPeriod(period, -1);
  const next = shiftDashboardPeriod(period, 1);
  const occupied = dashboard.occupiedUnitCount ?? 0;
  const totalUnits = dashboard.unitCount ?? 0;
  const occupancy = totalUnits > 0 ? Math.round(occupied / totalUnits * 100) : 0;
  const currentTenants = dashboard.activeTenantCount ?? 0;
  const upToDateTenants = Math.max(0, currentTenants - (dashboard.overdueTenantCount ?? 0));

  return <div className="page-stack dashboard-v2 dashboard-operational">
    <section className="dashboard-hero">
      <div className="dashboard-hero__content">
        <p className="dashboard-hero__eyebrow">{t("Accueil", "Home")} · {monthLabel(period, language)}</p>
        <h1>{greetingName ? t(`Bonjour, ${greetingName}`, `Hello, ${greetingName}`) : t("Bonjour", "Hello")}</h1>
        <p>{t("La situation opérationnelle réelle de votre organisation, sans mélange avec les données d’autres organisations.", "Your Organization’s real operational position, with no cross-tenant aggregation.")}</p>
        <div className="dashboard-period-nav" aria-label={t("Période active", "Active period")}>
          <Link className="button button--on-dark" href={`/app?month=${previous.key}`}><ArrowLeft size={16} />{t("Précédent", "Previous")}</Link>
          <strong>{monthLabel(period, language)}</strong>
          <Link className="button button--on-dark" href={`/app?month=${next.key}`}>{t("Suivant", "Next")}<ArrowRight size={16} /></Link>
        </div>
      </div>
      <div className="dashboard-hero__portfolio"><span className="dashboard-hero__mark" aria-hidden="true"><Gauge size={24} /></span><small>{t("Organisation active", "Active Organization")}</small><strong>{organizationName}</strong><p>{t("Données propres à votre organisation, permissions vérifiées à chaque requête.", "Tenant-scoped data with recalculated permissions.")}</p></div>
    </section>

    {dashboard.financeAvailable ? <>
      <section className="operational-kpi-grid" aria-label={t("Indicateurs financiers", "Financial indicators")}>
        <FinancialStateCard icon={CalendarClock} label={t("Attendu", "Expected")} value={money(dashboard.expectedXaf, language)} helper={t("Échéances de la période active", "Dues in the active period")} tone="info" />
        <FinancialStateCard icon={Banknote} label={t("Encaissé", "Collected")} value={money(dashboard.collectedXaf, language)} helper={t("Paiements confirmés reçus pendant la période", "Confirmed Payments received during the period")} tone="positive" />
        <FinancialStateCard icon={WalletCards} label={t("Couvert par un crédit", "Covered by credit")} value={money(dashboard.creditAppliedXaf, language)} helper={t("Crédit d’ouverture et trop-perçus déjà déduits des échéances", "Opening and Payment credit applied")} tone="neutral" />
        <FinancialStateCard icon={CircleDollarSign} label={t("Reste dû", "Remaining")} value={money(dashboard.remainingXaf, language)} helper={t("Position réelle des échéances de la période", "Real position of dues in the period")} tone={dashboard.remainingXaf ? "warning" : "positive"} />
        <FinancialStateCard icon={AlertTriangle} label={t("En retard", "Overdue")} value={money(dashboard.overdueXaf, language)} helper={t(`${dashboard.overdueCount ?? 0} échéance(s)`, `${dashboard.overdueCount ?? 0} due(s)`)} tone={dashboard.overdueCount ? "danger" : "positive"} />
      </section>
      <p className="dashboard-truth-note">{t("Attendu, encaissé, crédit et reste dû sont des vérités distinctes : Kjora ne soustrait pas arbitrairement les paiements du montant attendu.", "Expected, collected, credit and remaining are distinct truths: Kjora never arbitrarily subtracts Payments from expected amounts.")}</p>
    </> : <Card className="dashboard-access-card"><ShieldCheck size={22} /><div><h2>{t("Finance protégée", "Finance protected")}</h2><p>{t("Votre rôle ne donne pas accès aux informations financières. Aucun montant financier n’est exposé.", "Your role does not have Due and Payment capabilities. No financial amount is exposed.")}</p></div></Card>}

    <div className="dashboard-lower-grid">
      <Card className="operations-summary-card">
        <div className="section-heading"><div><p className="eyebrow">{t("Portefeuille", "Portfolio")}</p><h2>{t("Occupation et locataires", "Occupancy and tenants")}</h2></div><Building2 size={22} /></div>
        {dashboard.portfolioAvailable ? <div className="operations-stat-list">
          <div><strong>{occupancy} %</strong><span>{t("Taux d’occupation", "Occupancy rate")}</span><small>{occupied}/{totalUnits} {t("unités occupées", "occupied units")}</small></div>
          <div><strong>{upToDateTenants}</strong><span>{t("Locataires à jour", "Tenants up to date")}</span><small>{currentTenants} {t("locations actives", "active leases")}</small></div>
          <div><strong>{dashboard.overdueTenantCount ?? "—"}</strong><span>{t("Locataires en retard", "Overdue tenants")}</span><small>{t("Selon les échéances réelles", "From real dues")}</small></div>
        </div> : <p>{t("Données de portefeuille non accessibles à ce rôle.", "Portfolio data is not available to this role.")}</p>}
      </Card>
      <Card className="operations-summary-card">
        <div className="section-heading"><div><p className="eyebrow">{t("Échéances", "Dues")}</p><h2>{t("À traiter", "Needs attention")}</h2></div><Clock3 size={22} /></div>
        {dashboard.financeAvailable ? <div className="operations-stat-list operations-stat-list--compact"><div><strong>{dashboard.upcomingCount ?? 0}</strong><span>{t("À venir ce mois", "Upcoming this month")}</span></div><div><strong>{dashboard.partialCount ?? 0}</strong><span>{t("Partiellement payées", "Partially paid")}</span></div><div><strong>{dashboard.overdueCount ?? 0}</strong><span>{t("En retard", "Overdue")}</span></div></div> : <p>{t("Indicateurs financiers protégés.", "Financial indicators protected.")}</p>}
        {dashboard.financeAvailable ? <Link className="dashboard-inline-link" href="/app/paiements">{t("Ouvrir les paiements", "Open payments")}<ArrowRight size={16} /></Link> : null}
      </Card>
    </div>

    <ActivityFeed events={activity} currentUserId={null} compact />
  </div>;
}

export function ActivityFeed({ events, currentUserId, compact = false, nextHref }: {
  events: ActivityEvent[]; currentUserId: string | null; compact?: boolean; nextHref?: string | null;
}) {
  const { language } = usePreferences();
  const t = useCopy();
  return <Card className="activity-feed-card">
    <div className="section-heading"><div><p className="eyebrow">{t("Activité", "Activity")}</p><h2>{t(compact ? "Activité récente" : "Journal d’activité", compact ? "Recent activity" : "Activity feed")}</h2><p>{t("Événements métier réels autorisés pour votre rôle.", "Real business events authorized for your role.")}</p></div><Activity size={22} /></div>
    {events.length ? <div className="activity-feed">{events.map((event) => { const href = activityHref(event); return <div className="activity-feed__row" key={event.id}><span className="activity-feed__marker" aria-hidden="true" /><div><strong>{activityCopy(event, t)}</strong><span>{event.contextLabel}</span><small>{event.actorUserId && event.actorUserId === currentUserId ? t("Par vous", "By you") : t("Par un membre autorisé", "By an authorized member")} · {dateTime(event.createdAt, language)}</small></div>{href ? <Link aria-label={t("Ouvrir le contexte", "Open context")} href={href} prefetch={false} target={event.type.startsWith("DOCUMENT_") ? "_blank" : undefined}><ArrowRight size={17} /></Link> : null}</div>; })}</div> : <EmptyState icon={History} title={t("Aucune activité", "No activity")} description={t("Les prochains événements autorisés apparaîtront ici.", "The next authorized events will appear here.")} />}
    <div className="activity-feed__footer">{compact ? <Link className="button button--secondary" href="/app/activite">{t("Voir toute l’activité", "View all activity")}</Link> : null}{nextHref ? <Link className="button button--secondary" href={nextHref}>{t("Afficher la suite", "Show more")}<ArrowRight size={16} /></Link> : null}</div>
  </Card>;
}

export function OperationalAuditView({ entries, filters, nextHref }: { entries: AuditEntry[]; filters: AuditFilters; nextHref: string | null }) {
  const { language } = usePreferences();
  const t = useCopy();
  const actors = Array.from(new Map(entries.map((entry) => [entry.actorUserId, entry.actorEmail ?? entry.actorUserId])).entries());
  const actions = ["member.invited", "member.invitation_resent", "member.invitation_revoked", "member.invitation_accepted", "member.role_changed", "member.revoked", "owner.transferred", "payment.reversed", "document.invalidated"];
  return <Card className="audit-card" id="audit">
    <div className="section-heading"><div><p className="eyebrow">Owner</p><h2>{t("Audit sensible", "Sensitive audit")}</h2><p>{t("Journal métier immuable, distinct de l’activité utilisateur.", "Immutable business audit, distinct from user activity.")}</p></div><ShieldCheck size={23} /></div>
    <form className="audit-filters" method="get"><label className="field"><span>{t("Action", "Action")}</span><select defaultValue={filters.action ?? ""} name="action"><option value="">{t("Toutes", "All")}</option>{actions.map((action) => <option key={action} value={action}>{auditCopy(action, t)}</option>)}</select></label><label className="field"><span>{t("Acteur", "Actor")}</span><select defaultValue={filters.actor ?? ""} name="actor"><option value="">{t("Tous", "All")}</option>{actors.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className="field"><span>{t("Du", "From")}</span><input defaultValue={filters.from ?? ""} name="from" type="date" /></label><label className="field"><span>{t("Au", "To")}</span><input defaultValue={filters.to ?? ""} name="to" type="date" /></label><button className="button button--secondary" type="submit"><ListFilter size={16} />{t("Filtrer", "Filter")}</button></form>
    {entries.length ? <div className="audit-list">{entries.map((entry) => <div className="audit-list__row" key={entry.id}><span><strong>{auditCopy(entry.action, t)}</strong><small>{entry.actorEmail ?? t("Acteur interne", "Internal actor")}{entry.targetEmail ? ` → ${entry.targetEmail}` : ""}</small><small>{auditContext(entry, t)}</small></span><time dateTime={entry.createdAt}>{dateTime(entry.createdAt, language)}</time><Badge tone={entry.action === "payment.reversed" || entry.action === "document.invalidated" ? "warning" : "success"}>{t("Réussi", "Succeeded")}</Badge></div>)}</div> : <EmptyState icon={ShieldCheck} title={t("Aucune entrée", "No entries")} description={t("Aucune action ne correspond aux filtres.", "No action matches the filters.")} />}
    {nextHref ? <Link className="button button--secondary" href={nextHref}>{t("Afficher la suite", "Show more")}<ArrowRight size={16} /></Link> : null}
  </Card>;
}

export function OperationalHealthView({ health, emailDeliveryEnabled }: { health: OperationalHealth; emailDeliveryEnabled: boolean }) {
  const t = useCopy();
  const jobHealthy = health.dailyJob?.status === "succeeded";
  const documentsHealthy = health.documentBacklog === 0 && health.documentFailures === 0;
  const failedDeliveries = Number(health.deliveryCounts.failed ?? 0);
  return <Card className="operational-health-card" id="operations">
    <div className="section-heading"><div><p className="eyebrow">Owner</p><h2>{t("Santé opérationnelle", "Operational health")}</h2><p>{t("État synthétique sans erreurs fournisseur ni secrets.", "Summary status without provider errors or secrets.")}</p></div><Gauge size={22} /></div>
    <div className="health-grid"><div><span className={jobHealthy ? "health-dot is-ok" : "health-dot"} /><strong>{t("Job financier quotidien", "Daily financial job")}</strong><small>{health.dailyJob?.status ?? t("Aucune exécution observée", "No observed run")}</small></div><div><span className={documentsHealthy ? "health-dot is-ok" : "health-dot"} /><strong>{t("Documents / outbox", "Documents / outbox")}</strong><small>{health.documentBacklog} {t("en attente", "pending")} · {health.documentFailures} {t("échec(s)", "failure(s)")}</small></div><div><span className={failedDeliveries === 0 ? "health-dot is-ok" : "health-dot"} /><strong>{t("Livraisons", "Deliveries")}</strong><small>{failedDeliveries} {t("échec(s) final(aux)", "final failure(s)")}</small></div><div><span className="health-dot is-muted" /><strong>{t("Emails financiers", "Financial emails")}</strong><small>{emailDeliveryEnabled ? t("Worker autorisé", "Worker enabled") : t("Désactivés — déploiement sûr", "Disabled — safe rollout")}</small></div></div>
  </Card>;
}

export function OperationsPageView({
  activity, notifications, auditEntries, auditFilters, health, currentUserId,
  activityNextHref, auditNextHref, emailDeliveryEnabled, notificationNotice = null,
}: {
  activity: ActivityEvent[]; notifications: NotificationSummary[]; auditEntries: AuditEntry[] | null;
  auditFilters: AuditFilters; health: OperationalHealth | null; currentUserId: string;
  activityNextHref: string | null; auditNextHref: string | null; emailDeliveryEnabled: boolean;
  notificationNotice?: string | null;
}) {
  const t = useCopy();
  return <div className="page-stack operations-page"><header className="page-header"><div><p className="eyebrow">{t("Suivi", "Overview")}</p><h1>{t("Activité", "Activity")}</h1><p className="page-header__description">{t("Activité, notifications et journal d’audit de votre organisation.", "Activity, notifications and audit remain three distinct layers for the same active Organization.")}</p></div></header><ActivityFeed events={activity} currentUserId={currentUserId} nextHref={activityNextHref} /><div id="notifications"><NotificationsView embedded notice={notificationNotice} notifications={notifications} /></div>{auditEntries ? <OperationalAuditView entries={auditEntries} filters={auditFilters} nextHref={auditNextHref} /> : null}{health ? <OperationalHealthView emailDeliveryEnabled={emailDeliveryEnabled} health={health} /> : null}</div>;
}
