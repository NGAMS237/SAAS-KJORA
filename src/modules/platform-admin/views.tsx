"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
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
  FinanceEventRow,
  FinancePeriodFilter,
  FinanceSummary,
  InterventionCounters,
  OrganizationDetail,
  Paginated,
  PlatformCounters,
} from "./server";
import { FINANCE_PERIOD_FILTERS } from "./finance-periods";
import { formatMinorAmount as formatMoneyMinorAmount, minorToMajor } from "./money";
import {
  extendCommercialInterventionAction,
  grantCommercialInterventionAction,
  revokeCommercialInterventionAction,
  type CommercialActionResult,
} from "./commercial-ops-actions";

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
  interventionCounters = null,
}: {
  counters: PlatformCounters | null;
  indicators: MonitoringIndicator[];
  error: "denied" | "failed" | null;
  interventionCounters?: InterventionCounters | null;
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

      {interventionCounters ? (
        <section className="admin-section" aria-labelledby="commercial-counters-heading">
          <h2 id="commercial-counters-heading">{t.commercialCountersTitle}</h2>
          <div className="admin-counters">
            <Counter label={t.commercialCounterActive} value={interventionCounters.activeInterventions} />
            <Counter label={t.commercialCounterComplimentary} value={interventionCounters.complimentaryActive} />
            <Counter label={t.commercialCounterOfflinePayments} value={interventionCounters.offlinePaymentsActive} />
            <Counter label={t.commercialCounterExpiring30} value={interventionCounters.expiringNext30Days} />
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
                  <th scope="col">{t.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="admin-table__muted">
                      {t.emptyRows}
                    </td>
                  </tr>
                ) : (
                  page.rows.map((row) => (
                    <tr key={row.organizationId} className="admin-table__row">
                      <th scope="row">
                        <Link
                          href={`/administration/organizations/${row.organizationId}`}
                          className="admin-table__view-link"
                        >
                          {row.name || "—"}
                        </Link>
                      </th>
                      <td>{row.status}</td>
                      <td className="admin-table__num">{row.memberCount}</td>
                      <td>{row.plan}</td>
                      <td>{row.billingStatus}</td>
                      <td className="admin-table__muted">{formatDate(row.createdAt, lang)}</td>
                      <td>
                        {/* ADMIN-BILLING-OPS-01 — correctif UX : action explicite,
                            en plus du nom cliquable ci-dessus (redondance volontaire,
                            un <Link> natif suffit — pas de navigation impérative côté
                            client ajoutée pour ce correctif). */}
                        <Link
                          href={`/administration/organizations/${row.organizationId}`}
                          className="admin-table__actions-link"
                          aria-label={t.viewManageAriaLabel(row.name)}
                        >
                          {t.viewManageLabel}
                        </Link>
                      </td>
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

// =============================================================================
// ADMIN-BILLING-OPS-01 — Fiche Organization + interventions commerciales
// =============================================================================

const CANONICAL_GRANT_PLANS = ["decouverte", "essentiel", "avance", "patrimoine"] as const;
const INTERVENTION_TYPES = [
  "complimentary",
  "offline_payment",
  "promotion",
  "partnership",
  "support_adjustment",
] as const;
const REASON_CODES = [
  "sales_gift",
  "partner_offer",
  "manual_payment_received",
  "promotional_campaign",
  "support_goodwill",
  "other",
] as const;
const END_DATE_REQUIRED_TYPES = new Set(["complimentary", "promotion", "partnership"]);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatMoney(amountMinor: number | null, currency: string | null): string {
  if (amountMinor === null || !currency) return "—";
  const major = minorToMajor(amountMinor, currency);
  return `${major.toLocaleString("fr-FR")} ${currency}`;
}

/** Boîte de confirmation générique, native <dialog> (focus trap + Échap intégrés). */
function ConfirmDialog({
  id,
  title,
  open,
  onClose,
  children,
  onSubmit,
  submitLabel,
  cancelLabel,
  confirmChecked,
  onConfirmCheckedChange,
  confirmLabel,
  pending,
  feedback,
}: {
  id: string;
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  onSubmit: () => void;
  submitLabel: string;
  cancelLabel: string;
  confirmChecked: boolean;
  onConfirmCheckedChange: (checked: boolean) => void;
  confirmLabel: string;
  pending: boolean;
  feedback: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // L'ouverture/fermeture de <dialog> est un effet de bord (appel impératif
  // showModal()/close()), jamais une lecture pendant le rendu.
  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      id={id}
      ref={dialogRef}
      className="admin-dialog"
      onClose={onClose}
      aria-labelledby={`${id}-title`}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <h2 id={`${id}-title`}>{title}</h2>
        <div className="admin-dialog__body">{children}</div>
        {feedback ? (
          <p className="admin-error" role="alert">
            {feedback}
          </p>
        ) : null}
        <label className="admin-dialog__confirm">
          <input
            type="checkbox"
            checked={confirmChecked}
            onChange={(event) => onConfirmCheckedChange(event.target.checked)}
          />
          {confirmLabel}
        </label>
        <div className="admin-dialog__actions">
          <button type="button" className="admin-action-button" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="submit"
            className="admin-action-button admin-action-button--primary"
            disabled={!confirmChecked || pending}
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function ReasonField({
  value,
  onChange,
  label,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  id: string;
}) {
  return (
    <label className="admin-dialog__field" htmlFor={id}>
      <span>{label}</span>
      <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={3} required minLength={3} />
    </label>
  );
}

export function OrganizationDetailView({
  detail,
  error,
}: {
  detail: OrganizationDetail | null;
  error: "denied" | "failed" | "not_found" | null;
}) {
  const { t, lang } = useCopy();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [dialogFeedback, setDialogFeedback] = useState<string | null>(null);

  const [grantConfirmed, setGrantConfirmed] = useState(false);
  const [revokeConfirmed, setRevokeConfirmed] = useState(false);
  const [extendConfirmed, setExtendConfirmed] = useState(false);

  const [interventionType, setInterventionType] = useState<string>("complimentary");
  const [grantedPlan, setGrantedPlan] = useState<string>("essentiel");
  const [reasonCode, setReasonCode] = useState<string>("sales_gift");
  const [adminNote, setAdminNote] = useState("");
  const [startsOn, setStartsOn] = useState(todayIso());
  const [endsOn, setEndsOn] = useState("");
  const [currency, setCurrency] = useState("XAF");
  const [amount, setAmount] = useState("");
  const [manualReference, setManualReference] = useState("");
  const idempotencyKeyRef = useRef(newIdempotencyKey());

  const [revokeReason, setRevokeReason] = useState("");
  const [extendReason, setExtendReason] = useState("");
  const [newEndsOn, setNewEndsOn] = useState("");

  if (error === "not_found" || (!detail && !error)) {
    return (
      <div className="admin-page">
        <p className="admin-error" role="alert">
          {t.orgDetailNotFound}
        </p>
        <Link href="/administration/organizations">{t.orgDetailBackToList}</Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-page">
        <p className="admin-error" role="alert">
          {error === "denied" ? t.errorDenied : t.errorFailed}
        </p>
        <Link href="/administration/organizations">{t.orgDetailBackToList}</Link>
      </div>
    );
  }

  if (!detail) return null;

  function resultMessage(result: CommercialActionResult): string {
    if (!result.ok) return result.message;
    return t.outcomeLabels[result.outcome] ?? result.outcome;
  }

  function closeAllDialogs() {
    setGrantOpen(false);
    setRevokeOpen(false);
    setExtendOpen(false);
    setDialogFeedback(null);
    setGrantConfirmed(false);
    setRevokeConfirmed(false);
    setExtendConfirmed(false);
  }

  function handleGrantSubmit() {
    if (!detail) return;
    setDialogFeedback(null);
    startTransition(async () => {
      const result = await grantCommercialInterventionAction(
        detail.organizationId,
        interventionType,
        grantedPlan,
        reasonCode,
        adminNote,
        startsOn,
        endsOn || null,
        interventionType === "offline_payment" ? currency : null,
        interventionType === "offline_payment" && amount ? Number(amount) : null,
        interventionType === "offline_payment" ? manualReference || null : null,
        idempotencyKeyRef.current,
      );
      if (result.ok) {
        idempotencyKeyRef.current = newIdempotencyKey();
        closeAllDialogs();
        setFeedback({ kind: "success", message: resultMessage(result) });
        router.refresh();
      } else {
        setDialogFeedback(resultMessage(result));
      }
    });
  }

  function handleRevokeSubmit() {
    if (!detail || !detail.activeIntervention) return;
    setDialogFeedback(null);
    startTransition(async () => {
      const result = await revokeCommercialInterventionAction(
        detail.organizationId,
        detail.activeIntervention!.interventionId,
        revokeReason,
      );
      if (result.ok) {
        closeAllDialogs();
        setRevokeReason("");
        setFeedback({ kind: "success", message: resultMessage(result) });
        router.refresh();
      } else {
        setDialogFeedback(resultMessage(result));
      }
    });
  }

  function handleExtendSubmit() {
    if (!detail || !detail.activeIntervention) return;
    setDialogFeedback(null);
    startTransition(async () => {
      const result = await extendCommercialInterventionAction(
        detail.organizationId,
        detail.activeIntervention!.interventionId,
        newEndsOn,
        extendReason,
      );
      if (result.ok) {
        closeAllDialogs();
        setExtendReason("");
        setNewEndsOn("");
        setFeedback({ kind: "success", message: resultMessage(result) });
        router.refresh();
      } else {
        setDialogFeedback(resultMessage(result));
      }
    });
  }

  const intervention = detail.activeIntervention;
  const endDateRequired = END_DATE_REQUIRED_TYPES.has(interventionType);

  return (
    <div className="admin-page">
      <Link href="/administration/organizations" className="admin-breadcrumb">
        {t.orgDetailBackToList}
      </Link>

      <header className="admin-page__header">
        <h1>{t.orgDetailTitle(detail.name || "—")}</h1>
        <p>
          {t.colStatus}: {detail.status} · {t.colCreated}: {formatDate(detail.createdAt, lang)}
        </p>
      </header>

      {feedback ? (
        <p className={feedback.kind === "success" ? "admin-success" : "admin-error"} role="status">
          {feedback.message}
        </p>
      ) : null}

      {detail.planBillingMismatch ? (
        <p className="admin-error" role="alert">
          {t.orgDetailMismatchWarning}
        </p>
      ) : null}

      <section className="admin-section">
        <h2>{t.overviewTitle}</h2>
        <dl className="admin-detail-grid">
          <div>
            <dt>{t.orgDetailOwnerEmail}</dt>
            <dd>{detail.ownerEmail ?? "—"}</dd>
          </div>
          <div>
            <dt>{t.orgDetailActiveMembers}</dt>
            <dd>{detail.activeMemberCount}</dd>
          </div>
          <div>
            <dt>{t.orgDetailProperties}</dt>
            <dd>{detail.propertiesCount}</dd>
          </div>
          <div>
            <dt>{t.orgDetailUnits}</dt>
            <dd>{detail.unitsCount}</dd>
          </div>
          <div>
            <dt>{t.orgDetailEffectivePlan}</dt>
            <dd>
              <span className="admin-badge">{detail.effectivePlan}</span>
            </dd>
          </div>
          <div>
            <dt>{t.orgDetailSubscription}</dt>
            <dd>{detail.subscription.exists ? detail.subscription.plan : t.providerNo}</dd>
          </div>
          <div>
            <dt>{t.orgDetailBillingStatus}</dt>
            <dd>{detail.subscription.status}</dd>
          </div>
          <div>
            <dt>{t.orgDetailCycle}</dt>
            <dd>{detail.subscription.billingCycle}</dd>
          </div>
          <div>
            <dt>{t.orgDetailCurrency}</dt>
            <dd>{detail.subscription.currency}</dd>
          </div>
          <div>
            <dt>{t.orgDetailPeriodEnd}</dt>
            <dd>{formatDate(detail.subscription.currentPeriodEnd, lang)}</dd>
          </div>
          <div>
            <dt>{t.orgDetailProvider}</dt>
            <dd>{detail.subscription.provider ?? t.providerNo}</dd>
          </div>
        </dl>
      </section>

      <section className="admin-section">
        <h2>{t.orgDetailActiveInterventionTitle}</h2>
        {intervention ? (
          <dl className="admin-detail-grid">
            <div>
              <dt>{t.orgDetailInterventionType}</dt>
              <dd>{t.interventionTypeLabels[intervention.interventionType] ?? intervention.interventionType}</dd>
            </div>
            <div>
              <dt>{t.orgDetailInterventionReason}</dt>
              <dd>{t.reasonCodeLabels[intervention.reasonCode] ?? intervention.reasonCode}</dd>
            </div>
            <div>
              <dt>{t.orgDetailInterventionNote}</dt>
              <dd>{intervention.adminNote}</dd>
            </div>
            <div>
              <dt>{t.orgDetailInterventionPeriod}</dt>
              <dd>
                {formatDate(intervention.startsOn, lang)} → {intervention.endsOn ? formatDate(intervention.endsOn, lang) : "—"}
              </dd>
            </div>
            {intervention.interventionType === "offline_payment" ? (
              <>
                <div>
                  <dt>{t.orgDetailInterventionAmount}</dt>
                  <dd>{formatMoney(intervention.amountMinor, intervention.currency)}</dd>
                </div>
                <div>
                  <dt>{t.orgDetailInterventionReference}</dt>
                  <dd>{intervention.manualReference ?? "—"}</dd>
                </div>
              </>
            ) : null}
            <div>
              <dt>{t.orgDetailInterventionCreatedBy}</dt>
              <dd>{intervention.createdByEmail ?? "—"}</dd>
            </div>
            <div>
              <dt>{t.colStatus}</dt>
              <dd>
                <span className={intervention.effectivelyExpired ? "admin-badge admin-badge--archived" : "admin-badge"}>
                  {intervention.effectivelyExpired ? t.orgDetailInterventionExpired : t.orgDetailInterventionActive}
                </span>
              </dd>
            </div>
          </dl>
        ) : (
          <p className="admin-table__muted">{t.orgDetailNoActiveIntervention}</p>
        )}
      </section>

      <section className="admin-section">
        <h2>{t.actionsTitle}</h2>
        <div className="admin-actions-menu">
          {!intervention ? (
            <button type="button" className="admin-action-button admin-action-button--primary" onClick={() => setGrantOpen(true)}>
              {t.actionGrant}
            </button>
          ) : (
            <>
              <button type="button" className="admin-action-button" onClick={() => setExtendOpen(true)}>
                {t.actionExtend}
              </button>
              <button type="button" className="admin-action-button admin-action-button--danger" onClick={() => setRevokeOpen(true)}>
                {t.actionRevoke}
              </button>
            </>
          )}
        </div>
      </section>

      <section className="admin-section">
        <h2>{t.orgDetailHistoryTitle}</h2>
        {detail.recentAdminEvents.length === 0 ? (
          <p className="admin-table__muted">{t.orgDetailNoHistory}</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">{t.colObserved}</th>
                  <th scope="col">{t.orgDetailInterventionType}</th>
                </tr>
              </thead>
              <tbody>
                {detail.recentAdminEvents.map((event) => (
                  <tr key={event.eventId}>
                    <td className="admin-table__muted">{formatDateTime(event.createdAt, lang)}</td>
                    <td>{t.eventTypeLabels[event.eventType] ?? event.eventType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        id="grant-dialog"
        title={t.actionGrant}
        open={grantOpen}
        onClose={closeAllDialogs}
        onSubmit={handleGrantSubmit}
        submitLabel={t.formConfirm}
        cancelLabel={t.formCancel}
        confirmChecked={grantConfirmed}
        onConfirmCheckedChange={setGrantConfirmed}
        confirmLabel={t.formConfirmCheckbox}
        pending={isPending}
        feedback={dialogFeedback}
      >
        <p className="admin-dialog__summary-title">{t.grantSummaryTitle}</p>
        <p>
          {t.grantSummaryOrganization}: <strong>{detail.name}</strong>
        </p>
        <label className="admin-dialog__field">
          <span>{t.formInterventionType}</span>
          <select value={interventionType} onChange={(e) => setInterventionType(e.target.value)}>
            {INTERVENTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {t.interventionTypeLabels[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-dialog__field">
          <span>{t.formGrantedPlan}</span>
          <select value={grantedPlan} onChange={(e) => setGrantedPlan(e.target.value)}>
            {CANONICAL_GRANT_PLANS.map((plan) => (
              <option key={plan} value={plan}>
                {plan}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-dialog__field">
          <span>{t.formReasonCode}</span>
          <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
            {REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {t.reasonCodeLabels[code]}
              </option>
            ))}
          </select>
        </label>
        <ReasonField id="grant-note" label={t.formAdminNote} value={adminNote} onChange={setAdminNote} />
        <label className="admin-dialog__field">
          <span>{t.formStartsOn}</span>
          <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
        </label>
        <label className="admin-dialog__field">
          <span>
            {t.formEndsOn} {endDateRequired ? <em>({t.formEndsOnRequired})</em> : null}
          </span>
          <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} required={endDateRequired} />
        </label>
        {interventionType === "offline_payment" ? (
          <>
            <label className="admin-dialog__field">
              <span>{t.formCurrency}</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="XAF">XAF</option>
                <option value="CAD">CAD</option>
              </select>
            </label>
            <label className="admin-dialog__field">
              <span>{t.formAmount}</span>
              <input
                type="number"
                min={1}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label className="admin-dialog__field">
              <span>{t.formManualReference}</span>
              <input type="text" value={manualReference} onChange={(e) => setManualReference(e.target.value)} maxLength={200} />
            </label>
          </>
        ) : null}
        <p className="admin-table__muted">{t.grantSummaryConsequence}</p>
      </ConfirmDialog>

      <ConfirmDialog
        id="revoke-dialog"
        title={t.actionRevoke}
        open={revokeOpen}
        onClose={closeAllDialogs}
        onSubmit={handleRevokeSubmit}
        submitLabel={t.formConfirm}
        cancelLabel={t.formCancel}
        confirmChecked={revokeConfirmed}
        onConfirmCheckedChange={setRevokeConfirmed}
        confirmLabel={t.formConfirmCheckbox}
        pending={isPending}
        feedback={dialogFeedback}
      >
        <p>{t.revokeConfirmText}</p>
        <ReasonField id="revoke-reason" label={t.formReason} value={revokeReason} onChange={setRevokeReason} />
      </ConfirmDialog>

      <ConfirmDialog
        id="extend-dialog"
        title={t.actionExtend}
        open={extendOpen}
        onClose={closeAllDialogs}
        onSubmit={handleExtendSubmit}
        submitLabel={t.formConfirm}
        cancelLabel={t.formCancel}
        confirmChecked={extendConfirmed}
        onConfirmCheckedChange={setExtendConfirmed}
        confirmLabel={t.formConfirmCheckbox}
        pending={isPending}
        feedback={dialogFeedback}
      >
        <p>{t.extendConfirmText}</p>
        <label className="admin-dialog__field">
          <span>{t.formNewEndsOn}</span>
          <input type="date" value={newEndsOn} onChange={(e) => setNewEndsOn(e.target.value)} required />
        </label>
        <ReasonField id="extend-reason" label={t.formReason} value={extendReason} onChange={setExtendReason} />
      </ConfirmDialog>
    </div>
  );
}

// =============================================================================
// FINANCE-ADMIN-01 — Finances (lecture seule)
// =============================================================================
// Trois principes tenus dans toute cette section :
//   1. CAD et XAF ne sont jamais additionnés ni affichés dans une même barre
//      ou un même total — chaque montant reste sous sa devise.
//   2. « Attendu » (théorique) et « encaissé » (réel) restent deux blocs
//      visuellement distincts, jamais une seule ligne fusionnée.
//   3. Chaque graphique est accompagné de sa table de valeurs — le graphique
//      n'est jamais la seule façon d'obtenir un chiffre exact.

/** Formatte un montant en unités mineures vers une chaîne lisible, sans jamais
 *  convertir entre devises ni les additionner. Délègue la conversion réelle
 *  (CAD /100, XAF inchangé) à money.ts — jamais de règle "/100" locale ici. */
function formatMinorAmount(minor: number, currency: string, lang: "fr" | "en"): string {
  return formatMoneyMinorAmount(minor, currency, lang === "en" ? "en-CA" : "fr-FR");
}

/** Barre horizontale accessible + table de valeurs. Aucune barre n'est jamais
 *  affichée seule : `role="img"` porte un `aria-label` résumant les valeurs,
 *  et la table qui suit reste la source exacte, toujours visible. */
function BarChart({
  title,
  entries,
  captionLabel,
  formatValue,
}: {
  title: string;
  entries: { key: string; label: string; value: number }[];
  captionLabel: string;
  formatValue: (value: number) => string;
}) {
  const max = Math.max(1, ...entries.map((e) => e.value));
  const summary = entries.map((e) => `${e.label}: ${formatValue(e.value)}`).join(", ");

  return (
    <div className="admin-chart">
      <h3>{title}</h3>
      <div className="admin-chart__bars" role="img" aria-label={`${title} — ${summary}`}>
        {entries.map((e) => (
          <div className="admin-chart__bar-row" key={e.key}>
            <span className="admin-chart__bar-label">{e.label}</span>
            <span className="admin-chart__bar-track">
              <span
                className="admin-chart__bar-fill"
                style={{ width: `${Math.round((e.value / max) * 100)}%` }}
              />
            </span>
            <span className="admin-chart__bar-value">{formatValue(e.value)}</span>
          </div>
        ))}
      </div>
      <details className="admin-chart__table">
        <summary>{captionLabel}</summary>
        <table className="admin-table">
          <tbody>
            {entries.map((e) => (
              <tr key={e.key}>
                <th scope="row">{e.label}</th>
                <td>{formatValue(e.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function ConnectorRow({
  label,
  connected,
  t,
}: {
  label: string;
  connected: boolean;
  t: ReturnType<typeof useCopy>["t"];
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>
        <span className={connected ? "admin-state admin-state--normal" : "admin-state admin-state--not-connected"}>
          {connected ? t.connectorStateConnected : t.connectorStateNotConnected}
        </span>
      </td>
    </tr>
  );
}

export function FinancesView({
  summary,
  events,
  error,
  period,
}: {
  summary: FinanceSummary | null;
  events: Paginated<FinanceEventRow> | null;
  error: "denied" | "failed" | null;
  period: FinancePeriodFilter;
}) {
  const { t, lang } = useCopy();

  const periodLabels: Record<FinancePeriodFilter, string> = {
    last_30_days: t.periodLast30Days,
    last_90_days: t.periodLast90Days,
    current_year: t.periodCurrentYear,
    all_time: t.periodAllTime,
  };

  const eventSourceLabel = (source: string): string => {
    if (source === "subscription") return t.financeEventSourceSubscription;
    if (source === "offline_payment") return t.financeEventSourceOfflinePayment;
    if (source === "manual_intervention") return t.financeEventSourceManualIntervention;
    return source;
  };

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h1>{t.financeTitle}</h1>
        <p>{t.financeSubtitle}</p>
        {summary ? <RefreshControl generatedAt={summary.generatedAt} /> : null}
      </header>

      {error ? (
        <p className="admin-error" role="alert">
          {error === "denied" ? t.errorDenied : t.errorFailed}
        </p>
      ) : null}

      <FilterBar action="/administration/finances">
        <label className="admin-filters__field">
          <span className="admin-filters__label">{t.financePeriodLabel}</span>
          <select name="period" defaultValue={period} className="admin-filters__select">
            {FINANCE_PERIOD_FILTERS.map((key) => (
              <option key={key} value={key}>
                {periodLabels[key]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="admin-filters__submit">
          {t.financeApplyFilter}
        </button>
      </FilterBar>

      {summary ? (
        <>
          {/* B. Compteurs commerciaux — état courant, indépendant de la période. */}
          <section className="admin-section" aria-labelledby="finance-counters-heading">
            <h2 id="finance-counters-heading">{t.financeSectionCounters}</h2>
            <div className="admin-counters">
              <Counter label={t.financeCounterOrganizations} value={summary.counters.organizationsTotal} />
              <Counter label={t.financeCounterFreeSubs} value={summary.counters.subscriptionsFree} />
              <Counter label={t.financeCounterPaidSubs} value={summary.counters.subscriptionsPaid} />
              <Counter
                label={t.financeCounterWithoutSubscription}
                value={summary.counters.organizationsWithoutSubscription}
              />
              <Counter label={t.financeCounterMismatches} value={summary.counters.planBillingMismatches} />
              <Counter
                label={t.financeCounterActiveInterventions}
                value={summary.counters.activeCommercialInterventions}
              />
              <Counter label={t.financeCounterActiveComplimentary} value={summary.counters.activeComplimentary} />
              <Counter label={t.financeCounterOfflinePayments} value={summary.counters.registeredOfflinePayments} />
            </div>
          </section>

          {/* C. Revenus RÉELLEMENT encaissés — jamais confondus avec le D. */}
          <section className="admin-section" aria-labelledby="finance-collected-heading">
            <h2 id="finance-collected-heading">{t.financeSectionCollected}</h2>
            <div className="admin-counters">
              <Counter
                label={t.financeCollectedOfflineCad}
                value={Math.round(minorToMajor(summary.collectedOfflineByCurrency.CAD ?? 0, "CAD"))}
              />
              <Counter
                label={t.financeCollectedOfflineXaf}
                value={Math.round(minorToMajor(summary.collectedOfflineByCurrency.XAF ?? 0, "XAF"))}
              />
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <tbody>
                  <tr>
                    <th scope="row">{t.financeCollectedOfflineCad}</th>
                    <td>
                      {formatMinorAmount(summary.collectedOfflineByCurrency.CAD ?? 0, "CAD", lang)}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">{t.financeCollectedOfflineXaf}</th>
                    <td>
                      {formatMinorAmount(summary.collectedOfflineByCurrency.XAF ?? 0, "XAF", lang)}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">{t.financeCollectedStripe}</th>
                    <td>
                      <span className="admin-state admin-state--not-connected">{t.notConnectedValue}</span>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">{t.financeCollectedMobileMoney}</th>
                    <td>
                      <span className="admin-state admin-state--not-connected">{t.notConnectedValue}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* D. Revenus MENSUELS attendus — théorique, jamais un encaissement. */}
          <section className="admin-section" aria-labelledby="finance-expected-heading">
            <h2 id="finance-expected-heading">{t.financeSectionExpected}</h2>
            <p className="admin-section__lead">{t.financeExpectedBasisNote}</p>
            <div className="admin-counters">
              <Counter
                label={t.financeExpectedCad}
                value={Math.round(minorToMajor(summary.expectedRevenueByCurrency.CAD ?? 0, "CAD"))}
              />
              <Counter
                label={t.financeExpectedXaf}
                value={Math.round(minorToMajor(summary.expectedRevenueByCurrency.XAF ?? 0, "XAF"))}
              />
            </div>
          </section>

          {/* E. Trois graphiques légers, chacun avec sa table de valeurs. */}
          <section className="admin-section" aria-labelledby="finance-charts-heading">
            <h2 id="finance-charts-heading">{t.financeSectionCharts}</h2>
            <div className="admin-charts-grid">
              <BarChart
                title={t.chartSubscriptionsByPlan}
                captionLabel={t.chartTableCaption}
                entries={Object.entries(summary.charts.subscriptionsByPlan).map(([plan, count]) => ({
                  key: plan,
                  label: plan,
                  value: count,
                }))}
                formatValue={(v) => String(v)}
              />
              <BarChart
                title={t.chartFreePaidBreakdown}
                captionLabel={t.chartTableCaption}
                entries={[
                  { key: "free", label: t.financeCounterFreeSubs, value: summary.charts.freePaidBreakdown.free },
                  { key: "paid", label: t.financeCounterPaidSubs, value: summary.charts.freePaidBreakdown.paid },
                  {
                    key: "without",
                    label: t.financeCounterWithoutSubscription,
                    value: summary.charts.freePaidBreakdown.withoutSubscription,
                  },
                ]}
                formatValue={(v) => String(v)}
              />
              <div className="admin-chart">
                <h3>{t.chartExpectedRevenueByCurrency}</h3>
                <div className="admin-charts-grid admin-charts-grid--tight">
                  <BarChart
                    title="CAD"
                    captionLabel={t.chartTableCaption}
                    entries={[
                      {
                        key: "cad",
                        label: t.financeExpectedCad,
                        value: summary.expectedRevenueByCurrency.CAD ?? 0,
                      },
                    ]}
                    formatValue={(v) => formatMinorAmount(v, "CAD", lang)}
                  />
                  <BarChart
                    title="XAF"
                    captionLabel={t.chartTableCaption}
                    entries={[
                      {
                        key: "xaf",
                        label: t.financeExpectedXaf,
                        value: summary.expectedRevenueByCurrency.XAF ?? 0,
                      },
                    ]}
                    formatValue={(v) => formatMinorAmount(v, "XAF", lang)}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* G. État des connecteurs — l'absence d'intégration n'est jamais « Normal ». */}
          <section className="admin-section" aria-labelledby="finance-connectors-heading">
            <h2 id="finance-connectors-heading">{t.financeSectionConnectors}</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <tbody>
                  <ConnectorRow label={t.connectorSupabaseInternal} connected={true} t={t} />
                  <ConnectorRow label={t.connectorStripe} connected={summary.stripeConnected} t={t} />
                  <ConnectorRow label={t.connectorMobileMoney} connected={summary.mobileMoneyConnected} t={t} />
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {/* F. Tableau des événements financiers récents — assaini, paginé. */}
      <section className="admin-section" aria-labelledby="finance-events-heading">
        <h2 id="finance-events-heading">{t.financeSectionEvents}</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">{t.colEventDate}</th>
                <th scope="col">{t.colEventOrganization}</th>
                <th scope="col">{t.colEventCategory}</th>
                <th scope="col">{t.colEventStatus}</th>
                <th scope="col">{t.colEventCurrency}</th>
                <th scope="col">{t.colEventAmount}</th>
                <th scope="col">{t.colEventSource}</th>
              </tr>
            </thead>
            <tbody>
              {events && events.rows.length > 0 ? (
                events.rows.map((ev) => (
                  <tr key={ev.eventId}>
                    <td>{formatDateTime(ev.occurredAt, lang) ?? "—"}</td>
                    <th scope="row">{ev.organizationName || "—"}</th>
                    <td>{ev.category}</td>
                    <td>{ev.status}</td>
                    <td>{ev.currency ?? "—"}</td>
                    <td>
                      {ev.amountMinor !== null && ev.currency
                        ? formatMinorAmount(ev.amountMinor, ev.currency, lang)
                        : t.notAvailable}
                    </td>
                    <td>{eventSourceLabel(ev.source)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="admin-table__muted">
                    {t.financeNoEvents}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {events ? (
          <Pagination page={events} basePath="/administration/finances" extraParams={{ period }} />
        ) : null}
      </section>
    </div>
  );
}
