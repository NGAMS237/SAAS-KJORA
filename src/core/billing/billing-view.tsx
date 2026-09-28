"use client";

// =============================================================================
// UI Abonnement & facturation (ALIGN-03)
// =============================================================================
// Messages simples, jamais techniques. Aucun montant n'est envoyé au serveur :
// les devis proviennent de la base.
// =============================================================================

import { useState } from "react";
import { CreditCard, ReceiptText, TriangleAlert } from "lucide-react";
import { Card, PageHeader, EmptyState, Badge } from "@/core/ui/ui";
import {
  BILLING_CYCLE_LABELS,
  INVOICE_STATUS_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_MESSAGES,
  formatAmount,
  priceFor,
  needsBillingWarning,
  isBillingBlocked,
  isReceiptAvailable,
  type BillingCycle,
  type InvoiceStatus,
  type SubscriptionStatus,
} from "@/core/billing/model";
import { PLAN_LABELS, type PlanSlug } from "@/core/entitlements/model";
import {
  needsIntentPreservation,
  planLabel,
  subscriptionCurrencyForBillingCountry,
  type BillingCountry,
  type SiteAppIntent,
} from "@/core/onboarding/plan-intent";
// Types importés depuis `types.ts`, module pur. Le client ne doit jamais
// importer `server.ts`, marqué `server-only`.
import {
  CHECKOUT_UNAVAILABLE_MESSAGES,
  RECURRENCE_MESSAGES,
  type BillingCheckoutAffordance,
  type BillingInvoice,
  type BillingOverview,
  type CheckoutUnavailableReason,
  type RecurrenceMode,
} from "@/core/billing/types";

const PLAN_ORDER: PlanSlug[] = ["decouverte", "essentiel", "avance", "patrimoine"];

type Quote = {
  plan?: string;
  outcome?: string;
  amountDueMinor?: number;
  creditMinor?: number;
  chargeMinor?: number;
  daysRemaining?: number;
  effectiveOn?: string;
  currency?: "XAF" | "CAD";
  blockers?: Array<{ libelle?: string; quota?: string; actuel: number; limite: number }>;
};

const SUBSCRIPTION_STATUS_LABELS_EN: Record<SubscriptionStatus, string> = {
  free: "Discovery", active: "Active", payment_failed: "Payment failed",
  grace: "Grace period", billing_blocked: "Account suspended",
  cancellation_scheduled: "Cancellation scheduled", cancelled: "Cancelled",
  reactivation_pending: "Reactivation pending",
};

const SUBSCRIPTION_STATUS_MESSAGES_EN: Record<SubscriptionStatus, string> = {
  free: "You are using Discovery for free. No payment method is required.",
  active: "Your subscription is active.",
  payment_failed: "The latest payment did not complete. You keep full access while we try again.",
  grace: "Your payment is pending. You keep full access, but it will be suspended if it is not settled before the grace period ends.",
  billing_blocked: "Your account is suspended because payment is due. Your data is intact: settle the subscription to restore access.",
  cancellation_scheduled: "Your subscription will end on its renewal date. You keep full access until then.",
  cancelled: "Your subscription has ended. Your data remains stored for the period stated in our terms.",
  reactivation_pending: "Your reactivation is in progress. It starts a new cycle without charging for suspended months.",
};

const INVOICE_STATUS_LABELS_EN: Record<InvoiceStatus, string> = {
  draft: "Draft", open: "Due", paid: "Paid", void: "Void", uncollectible: "Uncollectible",
};

const RECURRENCE_MESSAGES_EN: Record<RecurrenceMode, string> = {
  unattended: "The amount will be charged automatically at each renewal. You can stop at any time.",
  customer_approved: "At each renewal, you will receive a payment request to approve on your phone. Nothing is charged without your approval.",
};

const CHECKOUT_UNAVAILABLE_MESSAGES_EN: Record<CheckoutUnavailableReason, string> = {
  no_provider_configured: "Online payment is not available yet. Your request is recorded and we will contact you.",
  sandbox_only: "Online payment is being prepared. Your request is recorded and no amount is charged.",
  currency_unsupported: "No online payment method is available for this currency. We will contact you.",
  plan_is_free: "This plan is free. No payment method is required.",
  plan_requires_quote: "This plan requires a commercial discussion instead of an online subscription.",
};

function QuotaLine({ libelle, actuel, limite, unlimitedLabel }: { libelle: string; actuel: number; limite: number | null; unlimitedLabel: string }) {
  const depasse = limite !== null && actuel > limite;
  return (
    <div className="billing-quota">
      <span>{libelle}</span>
      <strong className={depasse ? "billing-quota--over" : undefined}>
        {actuel}{limite !== null ? ` / ${limite}` : ` / ${unlimitedLabel}`}
      </strong>
    </div>
  );
}

export function BillingView({
  overview,
  invoices,
  affordance,
  requestedIntent,
}: {
  overview: BillingOverview;
  invoices: BillingInvoice[];
  /** Décidé côté serveur. Le client n'apprend jamais quel provider est retenu. */
  affordance: BillingCheckoutAffordance;
  requestedIntent?: SiteAppIntent;
}) {
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const sub = overview.subscription;
  const bloque = isBillingBlocked(sub.status);
  const avertissement = needsBillingWarning(sub.status);
  const requestedPlan = requestedIntent?.plan;
  const [requestedCycle, setRequestedCycle] = useState<BillingCycle>(
    requestedIntent?.billingCycle ?? sub.billingCycle,
  );
  const [requestedBillingCountry, setRequestedBillingCountry] = useState<BillingCountry | "">(
    requestedIntent?.billingCountry ?? "",
  );
  const showRequestedIntent = Boolean(requestedPlan && needsIntentPreservation(requestedPlan));
  const locale = requestedIntent?.locale ?? "fr";
  const t = (fr: string, en: string) => locale === "en" ? en : fr;
  const selectedSubscriptionCurrency = requestedBillingCountry
    ? subscriptionCurrencyForBillingCountry(requestedBillingCountry)
    : sub.currency;

  async function persistIntent(cycle: BillingCycle, country: BillingCountry | "") {
    if (!requestedPlan || !country) return false;
    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent_mode: "replace",
        plan_intent: requestedPlan,
        billing_cycle_intent: cycle,
        billing_country_intent: country,
        locale_intent: locale,
        source_intent: requestedIntent?.source ?? null,
      }),
    });
    if (!response.ok) {
      setMessage(t("Impossible d’enregistrer ce choix. Réessayez.", "Unable to save this selection. Try again."));
      return false;
    }
    return true;
  }

  async function act(payload: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    setQuote(null);
    const response = await fetch("/api/billing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { result?: Quote } | null;
    if (!response.ok || !body?.result) {
      setMessage(t("L’opération n’a pas abouti. Réessayez dans un instant.", "The operation did not complete. Try again in a moment."));
      setBusy(false);
      return;
    }
    setQuote(body.result);
    setBusy(false);
  }

  async function openStripeTest(kind: "checkout" | "portal") {
    if (kind === "checkout" && (!requestedPlan || !requestedBillingCountry)) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/billing/stripe/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(kind === "checkout" ? {
        plan: requestedPlan,
        cycle: requestedCycle,
        locale,
        idempotency_key: crypto.randomUUID(),
      } : {}),
    });
    const body = await response.json().catch(() => null) as { redirect_url?: string } | null;
    if (!response.ok || !body?.redirect_url) {
      setMessage(t(
        "Stripe Test n’est pas configuré pour cette Preview. Aucun paiement n’a été lancé.",
        "Stripe Test is not configured for this Preview. No payment was started.",
      ));
      setBusy(false);
      return;
    }
    window.location.assign(body.redirect_url);
  }

  const prixCourant = priceFor(sub.plan, sub.billingCycle, sub.currency);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={t("Abonnement", "Subscription")}
        title={t("Abonnement & facturation", "Subscription & billing")}
        description={t("Votre plan, votre consommation et vos factures. Sans rapport avec les loyers que vous encaissez.", "Your plan, usage and invoices. This is separate from the rent you collect.")}
      />

      {showRequestedIntent && requestedPlan ? (
        <Card className="billing-state">
          <p className="eyebrow">{t("Votre sélection", "Your selection")}</p>
          <h2>{planLabel(requestedPlan, locale)}</h2>
          <p>
            {t(
              "Choisissez le cycle et le pays de facturation de votre abonnement KJORA. Cela ne change ni le pays ni la devise de vos biens.",
              "Choose the billing cycle and country for your KJORA subscription. This does not change the country or currency of your properties.",
            )}
          </p>
          <div className="form-grid">
            <label className="field">
              <span>{t("Cycle", "Cycle")}</span>
              <select value={requestedCycle} onChange={(event) => {
                const cycle = event.target.value as BillingCycle;
                setRequestedCycle(cycle);
                void persistIntent(cycle, requestedBillingCountry);
              }}>
                <option value="monthly">{t("Mensuel", "Monthly")}</option>
                <option value="annual">{t("Annuel", "Annual")}</option>
              </select>
            </label>
            <label className="field">
              <span>{t("Pays de facturation", "Billing country")}</span>
              <select required value={requestedBillingCountry} onChange={(event) => {
                const country = event.target.value as BillingCountry | "";
                setRequestedBillingCountry(country);
                void persistIntent(requestedCycle, country);
              }}>
                <option value="">{t("Choisir", "Choose")}</option>
                <option value="CA">Canada · CAD</option>
                <option value="CM">{t("Cameroun", "Cameroon")} · XAF</option>
              </select>
            </label>
          </div>
          {requestedBillingCountry ? <p><strong>{t("Devise d’abonnement", "Subscription currency")}: {subscriptionCurrencyForBillingCountry(requestedBillingCountry)}</strong></p> : null}
          <p><small>{t(
            "La confirmation enregistre seulement une demande de montée en gamme. Aucun paiement ni Checkout Stripe n’est lancé dans ce parcours.",
            "Confirming records an upgrade request only. No payment or Stripe Checkout is started in this flow.",
          )}</small></p>
          <button
            className="button button--primary"
            disabled={busy || requestedPlan === sub.plan || !requestedBillingCountry}
            onClick={async () => {
              if (await persistIntent(requestedCycle, requestedBillingCountry)) {
                await act({ action: "change_plan", plan: requestedPlan, cycle: requestedCycle, billing_country: requestedBillingCountry });
              }
            }}
            type="button"
          >
            {busy ? t("Préparation…", "Preparing…") : t("Préparer ce plan", "Prepare this plan")}
          </button>
        </Card>
      ) : null}

      {/* ---------------------------------------------------------- État */}
      <Card className={bloque ? "billing-state billing-state--blocked" : "billing-state"}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t("État", "Status")}</p>
            <h2>{locale === "en" ? SUBSCRIPTION_STATUS_LABELS_EN[sub.status] : SUBSCRIPTION_STATUS_LABELS[sub.status]}</h2>
          </div>
          {bloque || avertissement ? <TriangleAlert size={22} /> : <CreditCard size={22} />}
        </div>
        <p>{locale === "en" ? SUBSCRIPTION_STATUS_MESSAGES_EN[sub.status] : SUBSCRIPTION_STATUS_MESSAGES[sub.status]}</p>
        {sub.graceEndsOn ? <p><strong>{t(`Tolérance jusqu’au ${sub.graceEndsOn}.`, `Grace period until ${sub.graceEndsOn}.`)}</strong></p> : null}
        {sub.cancellationEffectiveOn ? (
          <p><strong>{t(`Fin d’abonnement prévue le ${sub.cancellationEffectiveOn}.`, `Subscription scheduled to end on ${sub.cancellationEffectiveOn}.`)}</strong></p>
        ) : null}
        {sub.status === "cancellation_scheduled" ? (
          <button className="button button--secondary" disabled={busy}
            onClick={() => act({ action: "resume" })} type="button">
            {t("Reprendre mon abonnement", "Resume my subscription")}
          </button>
        ) : null}
        {sub.status === "billing_blocked" || sub.status === "cancelled" ? (
          <button className="button button--primary" disabled={busy}
            onClick={() => act({ action: "reactivate" })} type="button">
            {t("Réactiver mon abonnement", "Reactivate my subscription")}
          </button>
        ) : null}
      </Card>

      {/* ----------------------------------------------------------- Plan */}
      <Card>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Plan</p>
            <h2>{PLAN_LABELS[overview.effectivePlan][locale]}</h2>
          </div>
          <Badge tone="neutral">{locale === "en" ? (sub.billingCycle === "annual" ? "Annual" : "Monthly") : BILLING_CYCLE_LABELS[sub.billingCycle]}</Badge>
        </div>
        <p>
          {prixCourant === null
            ? t("Ce plan fait l’objet d’un devis commercial.", "This plan requires a commercial quote.")
            : prixCourant === 0
              ? t("Gratuit, sans moyen de paiement.", "Free, with no payment method.")
              : `${formatAmount(prixCourant, sub.currency)} ${t(`par ${sub.billingCycle === "annual" ? "an" : "mois"}.`, `per ${sub.billingCycle === "annual" ? "year" : "month"}.`)}`}
        </p>
        {sub.renewalDate ? <p>{t("Prochaine échéance", "Next renewal")}: {sub.renewalDate}.</p> : null}
        {sub.scheduledPlan ? (
          <p className="form-feedback" role="status">
            {t(`Passage au plan ${PLAN_LABELS[sub.scheduledPlan].fr} prévu le ${sub.scheduledEffectiveOn}.`, `Change to the ${PLAN_LABELS[sub.scheduledPlan].en} plan scheduled for ${sub.scheduledEffectiveOn}.`)}
          </p>
        ) : null}
        {sub.pendingPlan ? (
          <p className="form-feedback" role="status">
            {t(`Changement vers ${PLAN_LABELS[sub.pendingPlan].fr} demandé. Le règlement en ligne n’est pas encore disponible : nous revenons vers vous.`, `Change to the ${PLAN_LABELS[sub.pendingPlan].en} plan requested. Online payment is not available yet; we will contact you.`)}
          </p>
        ) : null}
      </Card>

      {/* ---------------------------------------------------------- Usage */}
      <Card>
        <div className="section-heading">
          <div><p className="eyebrow">{t("Consommation", "Usage")}</p><h2>{t("Votre usage", "Your usage")}</h2></div>
        </div>
        <div className="billing-quotas">
          <QuotaLine libelle={t("Biens", "Properties")} actuel={overview.usage.activeProperties} limite={overview.quotas.maxProperties} unlimitedLabel={t("illimité", "unlimited")} />
          <QuotaLine libelle={t("Logements actifs", "Active units")} actuel={overview.usage.activeUnits} limite={overview.quotas.maxActiveUnits} unlimitedLabel={t("illimité", "unlimited")} />
          <QuotaLine libelle={t("Collaborateurs", "Team members")} actuel={overview.usage.collaborators} limite={overview.quotas.maxCollaborators} unlimitedLabel={t("illimité", "unlimited")} />
          <QuotaLine libelle={t("Organisations", "Organizations")} actuel={overview.usage.organizations} limite={overview.quotas.maxOrganizations} unlimitedLabel={t("illimité", "unlimited")} />
        </div>
      </Card>

      {/* --------------------------------------------------- Changer de plan */}
      {!bloque ? (
        <Card>
          <div className="section-heading">
            <div><p className="eyebrow">{t("Changer", "Change")}</p><h2>{t("Changer de plan", "Change plan")}</h2></div>
          </div>
          <label className="field">
            <span>{t("Pays de facturation KJORA", "KJORA billing country")}</span>
            <select required value={requestedBillingCountry} onChange={(event) => {
              const country = event.target.value as BillingCountry | "";
              setRequestedBillingCountry(country);
              void persistIntent(requestedCycle, country);
            }}>
              <option value="">{t("Choisir avant de préparer un changement", "Choose before preparing a change")}</option>
              <option value="CA">Canada · CAD</option>
              <option value="CM">{t("Cameroun", "Cameroon")} · XAF</option>
            </select>
            <small>{t(
              "Ce pays détermine la devise de l’abonnement KJORA et ne modifie jamais la devise des loyers.",
              "This country determines the KJORA subscription currency and never changes the rental currency.",
            )}</small>
          </label>
          <div className="billing-plan-grid">
            {PLAN_ORDER.filter((p) => p !== overview.effectivePlan).map((p) => {
              const prix = priceFor(p, sub.billingCycle, selectedSubscriptionCurrency);
              return (
                <button className="billing-plan-option" disabled={busy || !requestedBillingCountry} key={p} type="button"
                  onClick={() => act({ action: "change_plan", plan: p, cycle: sub.billingCycle, billing_country: requestedBillingCountry })}>
                  <strong>{PLAN_LABELS[p][locale]}</strong>
                  <span>{prix === null ? t("Sur devis", "Quote required") : prix === 0 ? t("Gratuit", "Free") : formatAmount(prix, selectedSubscriptionCurrency)}</span>
                </button>
              );
            })}
          </div>
          <p><small>{t(
            "Une montée en gamme prend effet immédiatement après règlement, au prorata du temps restant. Une descente prend effet à la fin de la période déjà payée, et seulement si votre usage tient dans les quotas du plan visé. Aucune donnée n’est jamais supprimée.",
            "An upgrade takes effect after payment, prorated for the remaining time. A downgrade takes effect at the end of the paid period and only when current usage fits the target plan. No data is ever deleted.",
          )}</small></p>

          {quote?.outcome === "upgrade_intent_recorded" ? (
            <div className="billing-quote" role="status">
              <h3>{t("Estimation", "Estimate")}</h3>
              <p>
                {typeof quote.amountDueMinor === "number"
                  ? t(`${formatAmount(quote.amountDueMinor, quote.currency ?? sub.currency)} pour les ${quote.daysRemaining} jours restants.`, `${formatAmount(quote.amountDueMinor, quote.currency ?? sub.currency)} for the remaining ${quote.daysRemaining} days.`)
                  : t("Estimation indisponible.", "Estimate unavailable.")}
              </p>
              <p><small>{t("Le règlement en ligne n’est pas encore disponible. Votre demande est enregistrée : aucun montant n’a été débité et votre plan actuel reste inchangé.", "Online payment is not available yet. Your request is recorded: no amount was charged and your current plan remains unchanged.")}</small></p>
            </div>
          ) : null}

          {quote?.outcome === "downgrade_refused" ? (
            <div className="billing-quote billing-quote--refused" role="alert">
              <h3>{t("Descente impossible pour l’instant", "Downgrade unavailable for now")}</h3>
              <p>{t("Votre usage dépasse les limites du plan visé :", "Your usage exceeds the target plan limits:")}</p>
              <ul>
                {(quote.blockers ?? []).map((b) => (
                  <li key={b.quota}>
                    {b.libelle ?? b.quota}: {b.actuel} {t("pour une limite de", "with a limit of")} {b.limite}
                  </li>
                ))}
              </ul>
              <p><small>{t("Rien n’a été modifié et aucune donnée n’a été supprimée.", "Nothing was changed and no data was deleted.")}</small></p>
            </div>
          ) : null}

          {quote?.outcome === "downgrade_scheduled" ? (
            <div className="billing-quote" role="status">
              <h3>{t("Changement programmé", "Change scheduled")}</h3>
              <p>{t(`Votre plan changera le ${quote.effectiveOn}, à la fin de la période déjà réglée.`, `Your plan will change on ${quote.effectiveOn}, at the end of the paid period.`)}</p>
            </div>
          ) : null}

          {quote?.outcome === "quote_required" ? (
            <div className="billing-quote" role="status">
              <h3>{t("Sur mesure", "Custom")}</h3>
              <p>{t("Ce plan passe par un échange commercial plutôt que par une souscription en ligne.", "This plan requires a commercial discussion instead of an online subscription.")}</p>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* ----------------------------------------------- Moyen de paiement */}
      <Card>
        <div className="section-heading">
          <div><p className="eyebrow">{t("Règlement", "Payment")}</p><h2>{t("Moyen de paiement", "Payment method")}</h2></div>
          <CreditCard size={22} />
        </div>
        {sub.paymentMethodLast4 ? (
          <p>{sub.paymentMethodBrand ?? t("Carte", "Card")} ···· {sub.paymentMethodLast4}
            {sub.paymentMethodExpiresOn ? t(` · expire le ${sub.paymentMethodExpiresOn}`, ` · expires ${sub.paymentMethodExpiresOn}`) : ""}</p>
        ) : (
          <p>{t("Aucun moyen de paiement enregistré.", "No payment method saved.")}</p>
        )}
        <p>
          {affordance.online && affordance.recurrence
            ? (locale === "en" ? RECURRENCE_MESSAGES_EN[affordance.recurrence] : RECURRENCE_MESSAGES[affordance.recurrence])
            : affordance.reason
              ? (locale === "en" ? CHECKOUT_UNAVAILABLE_MESSAGES_EN[affordance.reason] : CHECKOUT_UNAVAILABLE_MESSAGES[affordance.reason])
              : null}
        </p>
        {requestedBillingCountry === "CA" && requestedPlan && affordance.online ? (
          <button className="button button--primary" disabled={busy} onClick={() => void openStripeTest("checkout")} type="button">
            {busy ? t("Ouverture…", "Opening…") : t("Continuer vers Stripe Test", "Continue to Stripe Test")}
          </button>
        ) : null}
        {sub.provider === "stripe" ? (
          <button className="button button--secondary" disabled={busy} onClick={() => void openStripeTest("portal")} type="button">
            {t("Gérer dans le portail Stripe Test", "Manage in Stripe Test portal")}
          </button>
        ) : null}
      </Card>

      {/* -------------------------------------------------------- Factures */}
      <Card>
        <div className="section-heading">
          <div><p className="eyebrow">{t("Historique", "History")}</p><h2>{t("Factures", "Invoices")}</h2></div>
          <ReceiptText size={22} />
        </div>
        {invoices.length ? (
          <div className="billing-invoice-list">
            {invoices.map((facture) => (
              <div className="billing-invoice-row" key={facture.id}>
                <div>
                  <strong>{facture.number}</strong>
                  <span>{PLAN_LABELS[facture.plan][locale]} · {facture.periodStart} → {facture.periodEnd}</span>
                </div>
                <span className="financial-value">{formatAmount(facture.amountMinor, facture.currency)}</span>
                <Badge tone={facture.status === "paid" ? "success" : "neutral"}>
                  {locale === "en" ? INVOICE_STATUS_LABELS_EN[facture.status] : INVOICE_STATUS_LABELS[facture.status]}
                </Badge>
                {facture.currency === "XAF" ? (
                  <a
                    className="button button--secondary button--small"
                    href={`/api/billing/invoices/${facture.id}/download?lang=${locale}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {isReceiptAvailable(facture.status)
                      ? t("Télécharger le reçu", "Download receipt")
                      : t("Télécharger la facture", "Download invoice")}
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ReceiptText}
            title={t("Aucune facture", "No invoices")}
            description={t("Découverte est gratuit : aucune facture n’est émise tant que vous n’avez pas d’abonnement payant.", "Discovery is free: no invoice is issued until you have a paid subscription.")}
          />
        )}
      </Card>

      {/* ------------------------------------------------------ Annulation */}
      {sub.status === "active" ? (
        <Card muted>
          <h2>{t("Annuler l’abonnement", "Cancel subscription")}</h2>
          <p>{t("Vous conservez l’accès complet jusqu’à la fin de la période déjà réglée. Aucun remboursement n’est effectué et vos données sont conservées.", "You keep full access until the end of the paid period. No refund is issued and your data is retained.")}</p>
          <button className="button button--secondary" disabled={busy}
            onClick={() => act({ action: "cancel" })} type="button">
            {t("Annuler à l’échéance", "Cancel at renewal")}
          </button>
        </Card>
      ) : null}

      {message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}
    </div>
  );
}
