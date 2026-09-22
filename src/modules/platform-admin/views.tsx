"use client";

import type { ReactNode } from "react";
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
} from "./server";

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
  freeCount,
  paidCount,
}: {
  page: Paginated<AdminSubscriptionRow> | null;
  error: "denied" | "failed" | null;
  search: string;
  plan: string;
  status: string;
  currency: string;
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
                </tr>
              </thead>
              <tbody>
                {page.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="admin-table__muted">
                      {t.emptyRows}
                    </td>
                  </tr>
                ) : (
                  page.rows.map((row) => (
                    <tr key={row.organizationId}>
                      <th scope="row">{row.organizationName || "—"}</th>
                      <td>{row.status}</td>
                      <td>{row.plan}</td>
                      <td>{row.billingCycle}</td>
                      <td>{row.currency}</td>
                      <td className="admin-table__muted">{formatDate(row.currentPeriodEnd, lang)}</td>
                      <td className="admin-table__muted">{formatDate(row.renewalDate, lang)}</td>
                      <td className="admin-table__muted">{formatDate(row.graceEndsOn, lang)}</td>
                      <td>{row.hasProvider ? t.providerYes : t.providerNo}</td>
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
