"use client";

// =============================================================================
// KJORA — Écran « Organization suspendue / archivée » (REVENUE-LAUNCH-01 v3)
// =============================================================================
// Contexte LIMITÉ : identité minimale, statut, aide/support, et — pour une
// Organization suspendue seulement — facturation (lecture, régularisation) et
// export lecture seule du propriétaire. Toutes les données affichées ici sont
// déjà filtrées côté serveur par les RPC dédiées ; ce composant ne décide
// d'aucun droit. Aucun motif interne ni note Admin n'est jamais reçu.
// Aucune réactivation automatique : rien ici ne modifie le statut.
// =============================================================================

import Link from "next/link";
import { usePreferences } from "@/core/preferences/preferences-provider";
import { PreferencesControls } from "@/core/preferences/preferences-controls";
import { SupportForm } from "@/core/support/support-form";
import { SUSPENDED_COPY } from "@/core/organization/suspended-copy";
import { formatAmount, INVOICE_STATUS_LABELS, SUBSCRIPTION_STATUS_LABELS } from "@/core/billing/model";
import type { InvoiceStatus, SubscriptionStatus } from "@/core/billing/model";
import type { BillingInvoice, BillingOverview } from "@/core/billing/types";
import type { RestrictedOrganization } from "@/core/organization/restricted-organizations";

const INVOICE_STATUS_EN: Record<InvoiceStatus, string> = {
  draft: "Draft", open: "Payable", paid: "Paid", void: "Void", uncollectible: "Uncollectible",
};
const SUBSCRIPTION_STATUS_EN: Record<SubscriptionStatus, string> = {
  free: "Discovery", active: "Active", payment_failed: "Payment failed", grace: "Grace period",
  billing_blocked: "Account blocked", cancellation_scheduled: "Cancellation scheduled",
  cancelled: "Cancelled", reactivation_pending: "Reactivation pending",
};

export function SuspendedOrganizationView({
  organizations,
  selected,
  contactEmail,
  overview,
  invoices,
  hasActiveOrganizations,
  hasPortalIdentity,
}: {
  organizations: RestrictedOrganization[];
  selected: RestrictedOrganization;
  contactEmail: string | null;
  overview: BillingOverview | null;
  invoices: BillingInvoice[];
  hasActiveOrganizations: boolean;
  hasPortalIdentity: boolean;
}) {
  const { language } = usePreferences();
  const lang = language === "EN" ? "en" : "fr";
  const t = SUSPENDED_COPY[lang];
  const suspended = selected.status === "suspended";

  return (
    <main className="suspended-page">
      <div className="suspended-page__controls">
        <PreferencesControls compact />
      </div>

      <header className="suspended-page__header">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{suspended ? t.titleSuspended(selected.name) : t.titleArchived(selected.name)}</h1>
        <p>{suspended ? t.leadSuspended : t.leadArchived}</p>
        <span className={`admin-badge admin-badge--${selected.status}`}>
          {suspended ? t.statusSuspended : t.statusArchived}
        </span>
      </header>

      {organizations.length > 1 ? (
        <nav className="suspended-page__switcher" aria-label={t.switcherLabel}>
          {organizations.map((organization) => (
            <Link
              key={organization.id}
              href={`/organisation-suspendue?organization=${organization.id}`}
              aria-current={organization.id === selected.id ? "page" : undefined}
              className="suspended-page__switch"
            >
              {organization.name || "—"} · {organization.status === "suspended" ? t.statusSuspended : t.statusArchived}
            </Link>
          ))}
        </nav>
      ) : null}

      <section className="suspended-page__card">
        <h2>{t.unavailableTitle}</h2>
        <ul>
          {t.unavailableItems.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <p className="suspended-page__muted">{t.noAutomaticReactivation}</p>
      </section>

      <section className="suspended-page__card" aria-labelledby="suspended-support">
        <h2 id="suspended-support">{t.supportTitle}</h2>
        <p className="suspended-page__muted">{t.supportLead}</p>
        <SupportForm contactEmail={contactEmail} organizationId={selected.id} />
      </section>

      {suspended && selected.canViewBilling ? (
        <section className="suspended-page__card" aria-labelledby="suspended-billing">
          <h2 id="suspended-billing">{t.billingTitle}</h2>
          <p className="suspended-page__muted">{t.billingLead}</p>
          {overview ? (
            <dl className="admin-detail-grid">
              <div>
                <dt>{t.billingStatus}</dt>
                <dd>{lang === "en"
                  ? SUBSCRIPTION_STATUS_EN[overview.subscription.status]
                  : SUBSCRIPTION_STATUS_LABELS[overview.subscription.status]}</dd>
              </div>
              <div>
                <dt>{t.billingPlan}</dt>
                <dd>{overview.subscription.plan}</dd>
              </div>
            </dl>
          ) : null}
          {invoices.length === 0 ? (
            <p className="suspended-page__muted">{t.billingNoInvoices}</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">{t.invoiceNumber}</th>
                    <th scope="col">{t.invoiceStatus}</th>
                    <th scope="col">{t.invoiceAmount}</th>
                    <th scope="col">{t.invoiceDueOn}</th>
                    <th scope="col"><span className="sr-only">{t.invoiceDownload}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>{invoice.number}</td>
                      <td>{lang === "en" ? INVOICE_STATUS_EN[invoice.status] : INVOICE_STATUS_LABELS[invoice.status]}</td>
                      <td className="admin-table__num">{formatAmount(invoice.amountMinor, invoice.currency)}</td>
                      <td>{invoice.dueOn ?? invoice.periodEnd}</td>
                      <td>
                        {invoice.currency === "XAF" ? (
                          <a
                            href={`/api/organisation-suspendue/factures/${invoice.id}?organization=${selected.id}&lang=${lang}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t.invoiceDownload}
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {suspended ? (
        <section className="suspended-page__card" aria-labelledby="suspended-export">
          <h2 id="suspended-export">{t.exportTitle}</h2>
          {selected.canExport ? (
            <>
              <p className="suspended-page__muted">{t.exportLead}</p>
              <div className="suspended-page__actions">
                <form method="post" action="/api/organisation-suspendue/export">
                  <input type="hidden" name="organizationId" value={selected.id} />
                  <input type="hidden" name="format" value="xlsx" />
                  <button className="button button--primary" type="submit">{t.exportXlsx}</button>
                </form>
                <form method="post" action="/api/organisation-suspendue/export">
                  <input type="hidden" name="organizationId" value={selected.id} />
                  <input type="hidden" name="format" value="csv" />
                  <input type="hidden" name="scope" value="properties" />
                  <button className="button button--secondary" type="submit">{t.exportCsvProperties}</button>
                </form>
              </div>
            </>
          ) : (
            <p className="suspended-page__muted">{t.exportOwnerOnly}</p>
          )}
        </section>
      ) : (
        <section className="suspended-page__card">
          <p className="suspended-page__muted">{t.archivedNoAccess}</p>
        </section>
      )}

      <nav className="suspended-page__links">
        {hasActiveOrganizations ? <Link href="/app">{t.activeOrganizationsLink}</Link> : null}
        {hasPortalIdentity ? <Link href="/portal">{t.portalLink}</Link> : null}
      </nav>
    </main>
  );
}
