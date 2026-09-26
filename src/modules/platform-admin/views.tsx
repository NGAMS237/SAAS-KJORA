"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePreferences } from "@/core/preferences/preferences-provider";
import { ADMIN_COPY } from "./copy";
import {
  INDICATOR_LABELS,
  STATE_LABELS,
  type MonitoringIndicator,
  type MonitoringState,
} from "./monitoring";
import type {
  AdminOrganizationRow,
  AdminSubscriptionRow,
  Paginated,
  PlatformCounters,
  SubscriptionDetail,
} from "./server";
import {
  archiveSubscriptionAction,
  changeSubscriptionPlanAction,
  reactivateSubscriptionAction,
  revokeSubscriptionCancellationAction,
  scheduleSubscriptionCancellationAction,
  suspendSubscriptionAction,
  type SubscriptionActionResult,
} from "./subscription-actions";

// =============================================================================
// KJORA — ADMIN-01 — Vues de la console
// =============================================================================
// Composants client : seuls la langue et le thème nécessitent du contexte.
// Les données arrivent déjà résolues du serveur — aucune requête ici.
// =============================================================================

function useCopy() {
  const { language } = usePreferences();
  return { t: ADMIN_COPY[language === "EN" ? "en" : "fr"], lang: language === "EN" ? "en" : "fr" } as const;
}

/** Classe CSS par état. La couleur n'est jamais le seul porteur du sens :
 *  le libellé textuel est toujours présent (exigence d'accessibilité). */
const STATE_CLASS: Record<MonitoringState, string> = {
  normal: "admin-state admin-state--normal",
  incident: "admin-state admin-state--incident",
  stale: "admin-state admin-state--stale",
  unavailable: "admin-state admin-state--unavailable",
  not_connected: "admin-state admin-state--not-connected",
};

function formatDateTime(iso: string | null, lang: "fr" | "en"): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(lang === "en" ? "en-CA" : "fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function formatDate(value: string | null, lang: "fr" | "en"): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "en" ? "en-CA" : "fr-FR", {
    dateStyle: "short",
  }).format(d);
}

// ---------------------------------------------------------------------------
// Actualiser
// ---------------------------------------------------------------------------
// Redemande les données au serveur (RSC refetch) sans navigation complète —
// jamais de cache client silencieux sur des données d'administration.

function RefreshControl({ generatedAt }: { generatedAt: string | null }) {
  const { t, lang } = useCopy();
  const router = useRouter();
  const observed = formatDateTime(generatedAt, lang);

  return (
    <div className="admin-refresh">
      <span className="admin-refresh__label">
        {t.lastRefreshed} : {observed ?? t.neverObserved}
      </span>
      <button type="button" className="admin-refresh__button" onClick={() => router.refresh()}>
        {t.refreshButton}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vue d'ensemble
// ---------------------------------------------------------------------------

export function OverviewView({
  counters,
  indicators,
  error,
}: {
  counters: PlatformCounters | null;
  indicators: MonitoringIndicator[];
  error: "denied" | "failed" | null;
}) {
  const { t, lang } = useCopy();

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h1>{t.overviewTitle}</h1>
        <p>{t.overviewLead}</p>
        <RefreshControl generatedAt={counters?.generatedAt ?? null} />
      </header>

      {error ? (
        <p className="admin-error" role="alert">
          {error === "denied" ? t.errorDenied : t.errorFailed}
        </p>
      ) : null}

      {counters ? (
        <section className="admin-section" aria-labelledby="counters-heading">
          <h2 id="counters-heading">{t.countersTitle}</h2>
          <div className="admin-counters">
            <Counter label={t.organizationsTotal} value={counters.organizationsTotal} />
            <Counter label={t.organizationsActive} value={counters.organizationsActive} />
            <Counter label={t.organizationsSuspended} value={counters.organizationsSuspended} />
            <Counter label={t.subscriptionsFreeRegistered} value={counters.subscriptionsFree} />
            <Counter label={t.subscriptionsPaidRegistered} value={counters.subscriptionsPaid} />
            <Counter label={t.organizationsWithoutSubscription} value={counters.organizationsWithoutSubscription} />
          </div>

          <div className="admin-breakdowns">
            <Breakdown title={t.byPlan} data={counters.subscriptionsByPlan} empty={t.emptyRows} />
            <Breakdown title={t.byStatus} data={counters.subscriptionsByStatus} empty={t.emptyRows} />
          </div>
        </section>
      ) : null}

      <section className="admin-section" aria-labelledby="monitoring-heading">
        <h2 id="monitoring-heading">{t.monitoringTitle}</h2>
        <p className="admin-section__lead">{t.monitoringLead}</p>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">{t.colIndicator}</th>
                <th scope="col">{t.colState}</th>
                <th scope="col">{t.colSource}</th>
                <th scope="col">{t.colObserved}</th>
                <th scope="col">{t.colDetail}</th>
              </tr>
            </thead>
            <tbody>
              {indicators.map((indicator) => {
                const observed = formatDateTime(indicator.observedAt, lang);
                return (
                  <tr key={indicator.key}>
                    <th scope="row">
                      {INDICATOR_LABELS[indicator.key]?.[lang] ?? indicator.key}
                    </th>
                    <td>
                      <span className={STATE_CLASS[indicator.state]}>
                        {STATE_LABELS[indicator.state][lang]}
                      </span>
                    </td>
                    <td className="admin-table__muted">{indicator.source}</td>
                    <td className="admin-table__muted">{observed ?? t.neverObserved}</td>
                    <td className="admin-table__muted">{indicator.detail ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-counter">
      <span className="admin-counter__value">{value}</span>
      <span className="admin-counter__label">{label}</span>
    </div>
  );
}

function Breakdown({
  title,
  data,
  empty,
}: {
  title: string;
  data: Record<string, number>;
  empty: string;
}) {
  const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="admin-breakdown">
      <h3>{title}</h3>
      {entries.length === 0 ? (
        <p className="admin-table__muted">{empty}</p>
      ) : (
        <ul className="admin-breakdown__list">
          {entries.map(([key, count]) => (
            <li key={key}>
              <span>{key}</span>
              <strong>{count}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** `extraParams` : filtres actifs à préserver d'une page à l'autre (recherche, statut…). */
function buildQuery(offset: number, extraParams: Record<string, string>): string {
  const search = new URLSearchParams(extraParams);
  search.set("offset", String(offset));
  return search.toString();
}

function Pagination({
  page,
  basePath,
  extraParams = {},
}: {
  page: Paginated<unknown>;
  basePath: string;
  extraParams?: Record<string, string>;
}) {
  const { t } = useCopy();
  const from = page.total === 0 ? 0 : page.offset + 1;
  const to = Math.min(page.offset + page.rows.length, page.total);
  const hasPrev = page.offset > 0;
  const hasNext = page.offset + page.limit < page.total;

  return (
    <nav className="admin-pagination" aria-label={t.navLabel}>
      {hasPrev ? (
        <Link
          className="admin-pagination__link"
          href={`${basePath}?${buildQuery(Math.max(page.offset - page.limit, 0), extraParams)}`}
        >
          ← {t.previous}
        </Link>
      ) : (
        <span className="admin-pagination__link admin-pagination__link--disabled">
          ← {t.previous}
        </span>
      )}

      <span className="admin-pagination__info">{t.pageInfo(from, to, page.total)}</span>

      {hasNext ? (
        <Link
          className="admin-pagination__link"
          href={`${basePath}?${buildQuery(page.offset + page.limit, extraParams)}`}
        >
          {t.next} →
        </Link>
      ) : (
        <span className="admin-pagination__link admin-pagination__link--disabled">
          {t.next} →
        </span>
      )}
    </nav>
  );
}

/**
 * Formulaire de filtre commun (GET, sans JavaScript requis pour fonctionner) :
 * soumettre relance toujours la page à `offset=0` — un filtre change le jeu
 * de résultats, la pagination précédente n'a plus de sens.
 */
function FilterBar({ children, action }: { children: ReactNode; action: string }) {
  return (
    <form className="admin-filters" action={action} method="get">
      <input type="hidden" name="offset" value="0" />
      {children}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export function OrganizationsView({
  page,
  error,
  search,
  status,
}: {
  page: Paginated<AdminOrganizationRow> | null;
  error: "denied" | "failed" | null;
  search: string;
  status: string;
}) {
  const { t, lang } = useCopy();
  const hasFilters = search !== "" || status !== "";
  const extraParams: Record<string, string> = {};
  if (search) extraParams.q = search;
  if (status) extraParams.status = status;

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h1>{t.organizationsTitle}</h1>
        <p>{t.organizationsLead}</p>
      </header>

      <FilterBar action="/administration/organizations">
        <label className="admin-filters__field">
          <span className="admin-filters__label">{t.searchByName}</span>
          <input type="text" name="q" defaultValue={search} className="admin-filters__input" />
        </label>
        <label className="admin-filters__field">
          <span className="admin-filters__label">{t.colStatus}</span>
          <select name="status" defaultValue={status} className="admin-filters__select">
            <option value="">{t.filterStatusAll}</option>
            <option value="active">{t.filterStatusActive}</option>
            <option value="suspended">{t.filterStatusSuspended}</option>
          </select>
        </label>
        <button type="submit" className="admin-filters__submit">{t.applyFilters}</button>
        {hasFilters ? (
          <Link href="/administration/organizations" className="admin-filters__clear">
            {t.clearFilters}
          </Link>
        ) : null}
      </FilterBar>

      {error ? (
        <p className="admin-error" role="alert">
          {error === "denied" ? t.errorDenied : t.errorFailed}
        </p>
      ) : null}

      {page ? (
        <>
          <p className="admin-results-count">{t.resultsCount(page.total)}</p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">{t.colName}</th>
                  <th scope="col">{t.colStatus}</th>
                  <th scope="col">{t.colMembers}</th>
                  <th scope="col">{t.colPlan}</th>
                  <th scope="col">{t.colBilling}</th>
                  <th scope="col">{t.colCreated}</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="admin-table__muted">
                      {t.emptyRows}
                    </td>
                  </tr>
                ) : (
                  page.rows.map((row) => (
                    <tr key={row.organizationId}>
                      <th scope="row">{row.name || "—"}</th>
                      <td>{row.status}</td>
                      <td className="admin-table__num">{row.memberCount}</td>
                      <td>{row.plan}</td>
                      <td>{row.billingStatus}</td>
                      <td className="admin-table__muted">{formatDate(row.createdAt, lang)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} basePath="/administration/organizations" extraParams={extraParams} />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Abonnements
// ---------------------------------------------------------------------------

export function SubscriptionsView({
  page,
  error,
  search,
  plan,
  status,
  currency,
  archived,
  freeCount,
  paidCount,
}: {
  page: Paginated<AdminSubscriptionRow> | null;
  error: "denied" | "failed" | null;
  search: string;
  plan: string;
  status: string;
  currency: string;
  archived: "active" | "archived" | "all";
  freeCount: number | null;
  paidCount: number | null;
}) {
  const { t, lang } = useCopy();
  const hasFilters = search !== "" || plan !== "" || status !== "" || currency !== "";
  const extraParams: Record<string, string> = {};
  if (search) extraParams.q = search;
  if (plan) extraParams.plan = plan;
  if (status) extraParams.status = status;
  if (currency) extraParams.currency = currency;
  if (archived !== "active") extraParams.archived = archived;

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h1>{t.subscriptionsTitle}</h1>
        <p>{t.subscriptionsLead}</p>
        {freeCount !== null && paidCount !== null ? (
          <p className="admin-free-paid-summary">{t.freePaidSummary(freeCount, paidCount)}</p>
        ) : null}
      </header>

      <FilterBar action="/administration/abonnements">
        <label className="admin-filters__field">
          <span className="admin-filters__label">{t.searchByOrganization}</span>
          <input type="text" name="q" defaultValue={search} className="admin-filters__input" />
        </label>
        <label className="admin-filters__field">
          <span className="admin-filters__label">{t.colPlan}</span>
          <input
            type="text"
            name="plan"
            defaultValue={plan}
            placeholder={t.filterPlanAll}
            className="admin-filters__input"
          />
        </label>
        <label className="admin-filters__field">
          <span className="admin-filters__label">{t.colStatus}</span>
          <input
            type="text"
            name="status"
            defaultValue={status}
            placeholder={t.filterStatusAll}
            className="admin-filters__input"
          />
        </label>
        <label className="admin-filters__field">
          <span className="admin-filters__label">{t.colCurrency}</span>
          <input
            type="text"
            name="currency"
            defaultValue={currency}
            placeholder={t.filterCurrencyAll}
            className="admin-filters__input"
          />
        </label>
        <label className="admin-filters__field">
          <span className="admin-filters__label">{t.archivedFilterLabel}</span>
          <select name="archived" defaultValue={archived} className="admin-filters__select">
            <option value="active">{t.archivedFilterActive}</option>
            <option value="archived">{t.archivedFilterArchived}</option>
            <option value="all">{t.archivedFilterAll}</option>
          </select>
        </label>
        <button type="submit" className="admin-filters__submit">{t.applyFilters}</button>
        {hasFilters ? (
          <Link href="/administration/abonnements" className="admin-filters__clear">
            {t.clearFilters}
          </Link>
        ) : null}
      </FilterBar>

      {error ? (
        <p className="admin-error" role="alert">
          {error === "denied" ? t.errorDenied : t.errorFailed}
        </p>
      ) : null}

      {page ? (
        <>
          <p className="admin-results-count">{t.resultsCount(page.total)}</p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">{t.colName}</th>
                  <th scope="col">{t.colStatus}</th>
                  <th scope="col">{t.colPlan}</th>
                  <th scope="col">{t.colCycle}</th>
                  <th scope="col">{t.colCurrency}</th>
                  <th scope="col">{t.colPeriodEnd}</th>
                  <th scope="col">{t.colRenewal}</th>
                  <th scope="col">{t.colGraceEnds}</th>
                  <th scope="col">{t.colProvider}</th>
                  <th scope="col">{t.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="admin-table__muted">
                      {t.emptyRows}
                    </td>
                  </tr>
                ) : (
                  page.rows.map((row) => (
                    <tr key={row.organizationId}>
                      <th scope="row">
                        {row.organizationName || "—"}
                        {row.archived ? (
                          <span className="admin-badge admin-badge--archived">{t.archivedBadge}</span>
                        ) : null}
                      </th>
                      <td>{row.status}</td>
                      <td>{row.plan}</td>
                      <td>{row.billingCycle}</td>
                      <td>{row.currency}</td>
                      <td className="admin-table__muted">{formatDate(row.currentPeriodEnd, lang)}</td>
                      <td className="admin-table__muted">{formatDate(row.renewalDate, lang)}</td>
                      <td className="admin-table__muted">{formatDate(row.graceEndsOn, lang)}</td>
                      <td>{row.hasProvider ? t.providerYes : t.providerNo}</td>
                      <td>
                        <Link
                          href={`/administration/abonnements/${row.organizationId}`}
                          className="admin-table__view-link"
                        >
                          {t.viewDetail}
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} basePath="/administration/abonnements" extraParams={extraParams} />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Détail d'un abonnement — ADMIN-02
// ---------------------------------------------------------------------------
// Composant client : les actions sont des Server Actions Next.js (aucune
// mutation via GET, aucun secret ni prix envoyé par le client). Chaque action
// sensible passe par un <dialog> natif : focus piégé, fermeture au clavier
// (Échap) et retour de focus au déclencheur gérés par le navigateur.

const CANONICAL_PLANS = ["decouverte", "essentiel", "avance", "patrimoine", "sur_mesure"] as const;
const CANONICAL_CYCLES = ["monthly", "annual"] as const;

function ConfirmDialog({
  id,
  title,
  message,
  confirmLabel,
  cancelLabel,
  pending,
  children,
  onConfirm,
  onClose,
}: {
  id: string;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  pending: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <dialog id={id} className="admin-dialog" aria-labelledby={`${id}-title`} onClose={onClose}>
      <form method="dialog" className="admin-dialog__body">
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{message}</p>
        {children}
        <div className="admin-dialog__actions">
          <button type="button" className="admin-dialog__cancel" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="admin-dialog__confirm"
            onClick={onConfirm}
            disabled={pending}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function ActionFeedback({ result, t }: { result: SubscriptionActionResult | null; t: ReturnType<typeof useCopy>["t"] }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <p className="admin-error" role="alert">
        {result.message}
      </p>
    );
  }
  const label = t.subscriptionOutcomeLabels[result.outcome] ?? result.outcome;
  return (
    <p className="admin-success" role="status">
      {label}
    </p>
  );
}

export function SubscriptionDetailView({
  detail,
  error,
}: {
  detail: SubscriptionDetail | null;
  error: "denied" | "failed" | "not_found" | null;
}) {
  const { t, lang } = useCopy();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<SubscriptionActionResult | null>(null);
  const [reason, setReason] = useState("");
  const [targetPlan, setTargetPlan] = useState<(typeof CANONICAL_PLANS)[number]>("decouverte");
  const [targetCycle, setTargetCycle] = useState<(typeof CANONICAL_CYCLES)[number]>("monthly");

  const planDialogRef = useRef<HTMLDialogElement>(null);
  const suspendDialogRef = useRef<HTMLDialogElement>(null);
  const reactivateDialogRef = useRef<HTMLDialogElement>(null);
  const cancelDialogRef = useRef<HTMLDialogElement>(null);
  const revokeCancelDialogRef = useRef<HTMLDialogElement>(null);
  const archiveDialogRef = useRef<HTMLDialogElement>(null);

  if (error) {
    return (
      <div className="admin-page">
        <p className="admin-error" role="alert">
          {error === "denied" ? t.errorDenied : error === "not_found" ? t.subscriptionNotFound : t.errorFailed}
        </p>
      </div>
    );
  }
  if (!detail) return null;

  const run = (fn: () => Promise<SubscriptionActionResult>, dialog: HTMLDialogElement | null) => {
    startTransition(async () => {
      const result = await fn();
      setLastResult(result);
      setReason("");
      dialog?.close();
      if (result.ok) router.refresh();
    });
  };

  const isSuspended = detail.status === "billing_blocked";
  const isCancellationScheduled = detail.status === "cancellation_scheduled";
  const isArchived = detail.archivedAt !== null;
  const isActive = detail.status === "active";

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <p className="admin-breadcrumb">
          <Link href="/administration/abonnements">{t.subscriptionsTitle}</Link> / {detail.organizationName || "—"}
        </p>
        <h1>{detail.organizationName || "—"}</h1>
        {isArchived ? <span className="admin-badge admin-badge--archived">{t.archivedBadge}</span> : null}
      </header>

      <ActionFeedback result={lastResult} t={t} />

      <section className="admin-section" aria-labelledby="detail-heading">
        <h2 id="detail-heading">{t.subscriptionDetailTitle}</h2>
        <dl className="admin-detail-grid">
          <div><dt>{t.colStatus}</dt><dd>{detail.status}</dd></div>
          <div><dt>{t.colPlan}</dt><dd>{detail.plan}</dd></div>
          <div><dt>{t.colCycle}</dt><dd>{detail.billingCycle}</dd></div>
          <div><dt>{t.colCurrency}</dt><dd>{detail.currency}</dd></div>
          <div><dt>{t.periodStart}</dt><dd>{formatDate(detail.currentPeriodStart, lang)}</dd></div>
          <div><dt>{t.colPeriodEnd}</dt><dd>{formatDate(detail.currentPeriodEnd, lang)}</dd></div>
          <div><dt>{t.colRenewal}</dt><dd>{formatDate(detail.renewalDate, lang)}</dd></div>
          <div><dt>{t.colGraceEnds}</dt><dd>{formatDate(detail.graceEndsOn, lang)}</dd></div>
          <div><dt>{t.cancellationEffectiveOn}</dt><dd>{formatDate(detail.cancellationEffectiveOn, lang)}</dd></div>
        </dl>
      </section>

      <section className="admin-section" aria-labelledby="actions-heading">
        <h2 id="actions-heading">{t.actionsTitle}</h2>
        <div className="admin-actions-menu">
          {!isArchived && (
            <button
              type="button"
              className="admin-action-button"
              onClick={() => {
                setTargetPlan(detail.plan as (typeof CANONICAL_PLANS)[number]);
                setTargetCycle(detail.billingCycle as (typeof CANONICAL_CYCLES)[number]);
                planDialogRef.current?.showModal();
              }}
            >
              {t.actionChangePlan}
            </button>
          )}
          {!isArchived && !isSuspended && (
            <button type="button" className="admin-action-button" onClick={() => suspendDialogRef.current?.showModal()}>
              {t.actionSuspend}
            </button>
          )}
          {!isArchived && isSuspended && (
            <button type="button" className="admin-action-button" onClick={() => reactivateDialogRef.current?.showModal()}>
              {t.actionReactivate}
            </button>
          )}
          {!isArchived && !isCancellationScheduled && detail.status !== "free" && detail.status !== "cancelled" && (
            <button type="button" className="admin-action-button" onClick={() => cancelDialogRef.current?.showModal()}>
              {t.actionScheduleCancellation}
            </button>
          )}
          {!isArchived && isCancellationScheduled && (
            <button type="button" className="admin-action-button" onClick={() => revokeCancelDialogRef.current?.showModal()}>
              {t.actionRevokeCancellation}
            </button>
          )}
          {!isArchived && !isActive && (
            <button
              type="button"
              className="admin-action-button admin-action-button--danger"
              onClick={() => archiveDialogRef.current?.showModal()}
            >
              {t.actionArchive}
            </button>
          )}
        </div>
      </section>

      {detail.recentEvents.length > 0 ? (
        <section className="admin-section" aria-labelledby="audit-heading">
          <h2 id="audit-heading">{t.auditTitle}</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">{t.colObserved}</th>
                  <th scope="col">{t.auditEvent}</th>
                  <th scope="col">{t.auditTransition}</th>
                </tr>
              </thead>
              <tbody>
                {detail.recentEvents.map((ev, i) => (
                  <tr key={`${ev.eventType}-${ev.createdAt}-${i}`}>
                    <td className="admin-table__muted">{formatDateTime(ev.createdAt, lang)}</td>
                    <td>{ev.eventType}</td>
                    <td className="admin-table__muted">
                      {ev.fromStatus ?? "—"} → {ev.toStatus ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        id="dialog-change-plan"
        title={t.actionChangePlan}
        message={t.confirmChangePlan(detail.plan, targetPlan)}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        pending={isPending}
        onConfirm={() =>
          run(() => changeSubscriptionPlanAction(detail.organizationId, targetPlan, targetCycle, reason), planDialogRef.current)
        }
        onClose={() => planDialogRef.current?.close()}
      >
        <label className="admin-filters__field">
          <span className="admin-filters__label">{t.colPlan}</span>
          <select
            className="admin-filters__select"
            value={targetPlan}
            onChange={(e) => setTargetPlan(e.target.value as (typeof CANONICAL_PLANS)[number])}
          >
            {CANONICAL_PLANS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="admin-filters__field">
          <span className="admin-filters__label">{t.colCycle}</span>
          <select
            className="admin-filters__select"
            value={targetCycle}
            onChange={(e) => setTargetCycle(e.target.value as (typeof CANONICAL_CYCLES)[number])}
          >
            {CANONICAL_CYCLES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <ReasonField value={reason} onChange={setReason} label={t.reasonLabel} />
      </ConfirmDialog>

      <ConfirmDialog
        id="dialog-suspend"
        title={t.actionSuspend}
        message={t.confirmSuspend}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        pending={isPending}
        onConfirm={() => run(() => suspendSubscriptionAction(detail.organizationId, reason), suspendDialogRef.current)}
        onClose={() => suspendDialogRef.current?.close()}
      >
        <ReasonField value={reason} onChange={setReason} label={t.reasonLabel} />
      </ConfirmDialog>

      <ConfirmDialog
        id="dialog-reactivate"
        title={t.actionReactivate}
        message={t.confirmReactivate}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        pending={isPending}
        onConfirm={() => run(() => reactivateSubscriptionAction(detail.organizationId, reason), reactivateDialogRef.current)}
        onClose={() => reactivateDialogRef.current?.close()}
      >
        <ReasonField value={reason} onChange={setReason} label={t.reasonLabel} />
      </ConfirmDialog>

      <ConfirmDialog
        id="dialog-cancel"
        title={t.actionScheduleCancellation}
        message={t.confirmScheduleCancellation}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        pending={isPending}
        onConfirm={() =>
          run(() => scheduleSubscriptionCancellationAction(detail.organizationId, reason), cancelDialogRef.current)
        }
        onClose={() => cancelDialogRef.current?.close()}
      >
        <ReasonField value={reason} onChange={setReason} label={t.reasonLabel} />
      </ConfirmDialog>

      <ConfirmDialog
        id="dialog-revoke-cancel"
        title={t.actionRevokeCancellation}
        message={t.confirmRevokeCancellation}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        pending={isPending}
        onConfirm={() =>
          run(() => revokeSubscriptionCancellationAction(detail.organizationId, reason), revokeCancelDialogRef.current)
        }
        onClose={() => revokeCancelDialogRef.current?.close()}
      >
        <ReasonField value={reason} onChange={setReason} label={t.reasonLabel} />
      </ConfirmDialog>

      <ConfirmDialog
        id="dialog-archive"
        title={t.actionArchive}
        message={t.confirmArchive}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        pending={isPending}
        onConfirm={() => run(() => archiveSubscriptionAction(detail.organizationId, reason), archiveDialogRef.current)}
        onClose={() => archiveDialogRef.current?.close()}
      >
        <ReasonField value={reason} onChange={setReason} label={t.reasonLabel} />
      </ConfirmDialog>
    </div>
  );
}

function ReasonField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <label className="admin-filters__field">
      <span className="admin-filters__label">{label}</span>
      <textarea
        className="admin-filters__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
      />
    </label>
  );
}
