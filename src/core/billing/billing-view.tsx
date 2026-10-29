"use client";

// =============================================================================
// UI Abonnement & facturation (ALIGN-03)
// =============================================================================
// Messages simples, jamais techniques. Aucun montant n'est envoyé au serveur :
// les devis proviennent de la base.
// =============================================================================

import { useRef, useState } from "react";
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
  type BillingCurrency,
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
import { currentBillingPlan, isCurrentBillingPlan } from "@/core/billing/presentation";

const PLAN_ORDER: PlanSlug[] = ["decouverte", "essentiel", "avance", "patrimoine"];

type QuotaBlocker = { libelle?: string; quota?: string; actuel: number; limite: number };

type Quote = {
  plan?: string;
  outcome?: string;
  amountDueMinor?: number;
  creditMinor?: number;
  chargeMinor?: number;
  daysRemaining?: number;
  effectiveOn?: string;
  currency?: BillingCurrency;
  blockers?: QuotaBlocker[] | string[];
};

type BillingNotice = { kind: "error" | "success"; message: string };

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
  no_provider_configured: "Stripe is currently unavailable. No Checkout or payment was started.",
  sandbox_only: "Stripe Live is not enabled for this environment. No Checkout or payment was started.",
  pilot_invitation_required: "The paid pilot is invitation-only. No payment was started.",
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
  rentalMarket,
  stripeEnvironment,
}: {
  overview: BillingOverview;
  invoices: BillingInvoice[];
  /** Décidé côté serveur. Le client n'apprend jamais quel provider est retenu. */
  affordance: BillingCheckoutAffordance;
  requestedIntent?: SiteAppIntent;
  rentalMarket?: { country: string; currency: string } | null;
  stripeEnvironment: "test" | "live" | null;
}) {
  const [busy, setBusy] = useState(false);
  const inFlightRef = useRef(false);
  const checkoutAttemptKeys = useRef(new Map<string, string>());
  const [quote, setQuote] = useState<Quote | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<BillingNotice | null>(() => {
    if (typeof window === "undefined") return null;
    const persisted = window.sessionStorage.getItem("kjora.billing.notice");
    if (!persisted) return null;
    window.sessionStorage.removeItem("kjora.billing.notice");
    try {
      return JSON.parse(persisted) as BillingNotice;
    } catch {
      return null;
    }
  });

  const sub = overview.subscription;
  const currentPlan = currentBillingPlan(overview);
  const bloque = isBillingBlocked(sub.status);
  const avertissement = needsBillingWarning(sub.status);
  const requestedPlan = requestedIntent?.plan;
  const [requestedCycle, setRequestedCycle] = useState<BillingCycle>(
    requestedIntent?.billingCycle ?? sub.billingCycle,
  );
  const [requestedBillingCountry, setRequestedBillingCountry] = useState<BillingCountry | "">(
    requestedIntent?.billingCountry
      ?? sub.billingCountry
      ?? (rentalMarket?.country === "CI" ? "CI" : rentalMarket?.country === "CM" ? "CM" : ""),
  );
  const showRequestedIntent = Boolean(requestedPlan && needsIntentPreservation(requestedPlan));
  const locale = requestedIntent?.locale ?? "fr";
  const t = (fr: string, en: string) => locale === "en" ? en : fr;
  const selectedSubscriptionCurrency = requestedBillingCountry
    ? subscriptionCurrencyForBillingCountry(requestedBillingCountry)
    : sub.currency;
  const requestedPrice = requestedPlan
    ? priceFor(requestedPlan, requestedCycle, selectedSubscriptionCurrency)
    : null;
  const requestedCanCheckout = requestedBillingCountry === "CA"
    && typeof requestedPrice === "number"
    && requestedPrice > 0
    && stripeEnvironment !== null;
  const checkoutPlan = sub.pendingPlan && sub.pendingPlan !== "decouverte"
    ? sub.pendingPlan
    : requestedPlan && requestedPlan !== "decouverte"
      ? requestedPlan
      : null;
  const checkoutCycle = sub.pendingCycle ?? requestedCycle;
  const checkoutPrice = checkoutPlan ? priceFor(checkoutPlan, checkoutCycle, "CAD") : null;
  const marketBlockers = Array.isArray(quote?.blockers)
    ? quote.blockers.filter((blocker): blocker is string => typeof blocker === "string")
    : [];
  const quotaBlockers = Array.isArray(quote?.blockers)
    ? quote.blockers.filter((blocker): blocker is QuotaBlocker => typeof blocker === "object" && blocker !== null)
    : [];
  const marketChangeBlocked = quote?.outcome === "billing_market_change_blocked";

  function marketBlockerMessageFor(blockers: unknown) {
    const values = Array.isArray(blockers)
      ? blockers.filter((blocker): blocker is string => typeof blocker === "string")
      : [];
    return values.includes("active_commercial_intervention")
      ? t(
        "Une offre commerciale gratuite reste active. Révoquez-la ou attendez sa fin avant de changer de marché.",
        "A complimentary commercial offer is still active. Revoke it or wait for it to end before changing billing market.",
      )
      : t(
        "Un engagement financier actif doit d’abord être résolu. L’historique d’audit seul ne bloque pas ce changement.",
        "An active financial commitment must be resolved first. Audit history alone does not block this change.",
      );
  }

  const marketBlockerMessage = marketBlockerMessageFor(marketBlockers);

  function checkoutLabel(plan: PlanSlug, cycle: BillingCycle, amountMinor: number) {
    const amount = new Intl.NumberFormat(locale === "en" ? "en-CA" : "fr-CA", {
      style: "currency",
      currency: "CAD",
      currencyDisplay: "code",
    }).format(amountMinor / 100).replace(/\s/g, " ");
    const period = cycle === "annual" ? t("an", "year") : t("mois", "month");
    const action = stripeEnvironment === "test"
      ? t("Continuer vers Stripe Test", "Continue to Stripe Test")
      : t("Continuer vers Stripe", "Continue to Stripe");
    return `${planLabel(plan, locale)} — ${amount}/${period} — ${action}`;
  }

  function publishNotice(next: BillingNotice) {
    setNotice(next);
    window.sessionStorage.setItem("kjora.billing.notice", JSON.stringify(next));
  }

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
      const next = { kind: "error" as const, message: t("Impossible d’enregistrer ce choix. Réessayez.", "Unable to save this selection. Try again.") };
      setMessage(next.message);
      publishNotice(next);
      return false;
    }
    return true;
  }

  async function act(payload: Record<string, unknown>) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    setMessage(null);
    setQuote(null);
    try {
      const response = await fetch("/api/billing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as { result?: Quote } | null;
      if (!response.ok || !body?.result) {
        const next = { kind: "error" as const, message: t("L’opération n’a pas abouti. Réessayez dans un instant.", "The operation did not complete. Try again in a moment.") };
        setMessage(next.message);
        publishNotice(next);
        return;
      }
      setQuote(body.result);
      if (body.result.outcome === "billing_market_change_blocked") {
        publishNotice({ kind: "error", message: marketBlockerMessageFor(body.result.blockers) });
      } else {
        publishNotice({ kind: "success", message: t("Votre demande a été enregistrée. Aucun paiement n’a été lancé.", "Your request was recorded. No payment was started.") });
      }
    } catch {
      const next = { kind: "error" as const, message: t("Le serveur de facturation est momentanément injoignable. Réessayez dans un instant.", "The billing server is temporarily unreachable. Try again in a moment.") };
      setMessage(next.message);
      publishNotice(next);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }

  async function openStripe(kind: "checkout" | "portal", checkout?: { plan: PlanSlug; cycle: BillingCycle }) {
    if (kind === "checkout" && (!checkout || requestedBillingCountry !== "CA")) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const attemptFingerprint = checkout ? `${checkout.plan}:${checkout.cycle}:CA` : "portal";
      let idempotencyKey = checkoutAttemptKeys.current.get(attemptFingerprint);
      if (!idempotencyKey) {
        idempotencyKey = crypto.randomUUID();
        checkoutAttemptKeys.current.set(attemptFingerprint, idempotencyKey);
      }
      const response = await fetch(`/api/billing/stripe/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(kind === "checkout" ? {
          plan: checkout?.plan,
          cycle: checkout?.cycle,
          locale,
          idempotency_key: idempotencyKey,
        } : {}),
      });
      const body = await response.json().catch(() => null) as { redirect_url?: string; error?: string } | null;
      if (!response.ok || !body?.redirect_url) {
        const failure = body?.error === "billing_market_change_blocked"
          ? t("Le pays de facturation ne peut pas encore changer car un engagement financier actif doit d’abord être résolu. Aucun paiement n’a été lancé.", "The billing country cannot change yet because an active financial commitment must be resolved first. No payment was started.")
          : body?.error === "pilot_not_eligible"
            ? t("Cette Organization n’est pas admissible au Checkout Live pour ce pays. Aucun paiement n’a été lancé.", "This organization is not eligible for Live Checkout in this country. No payment was started.")
            : body?.error === "stripe_environment_mismatch"
              ? t("La configuration Stripe Live est incohérente avec l’environnement actif. Aucun Checkout n’a été créé.", "The Stripe Live configuration does not match the active environment. No Checkout was created.")
              : body?.error === "stripe_provider_rejected" || body?.error === "stripe_provider_error"
                ? t("Stripe a refusé la création du Checkout. Aucun paiement n’a été lancé.", "Stripe rejected Checkout creation. No payment was started.")
                : body?.error === "checkout_not_recorded"
                  ? t("Stripe a répondu, mais la session n’a pas pu être enregistrée. Ne réessayez pas immédiatement et contactez le support.", "Stripe responded, but the session could not be recorded. Do not retry immediately; contact support.")
                  : body?.error === "checkout_not_prepared"
                    ? t("Le serveur n’a pas pu préparer le Checkout. Aucun paiement n’a été lancé.", "The server could not prepare Checkout. No payment was started.")
                    : body?.error === "stripe_unavailable" || body?.error === "stripe_test_unavailable" || body?.error === "stripe_test_price_unavailable"
                      ? t("Stripe n’est pas disponible pour cette offre. Aucun paiement n’a été lancé.", "Stripe is unavailable for this offer. No payment was started.")
                      : t(`Une erreur technique (${body?.error ?? response.status}) a empêché la préparation du règlement. Aucun paiement n’a été lancé.`, `A technical error (${body?.error ?? response.status}) prevented payment preparation. No payment was started.`);
        setMessage(failure);
        publishNotice({ kind: "error", message: failure });
        return;
      }
      window.location.assign(body.redirect_url);
    } catch {
      const failure = t(
        "Impossible de joindre le service de règlement. Aucun Checkout ni paiement n’a été lancé.",
        "The payment service could not be reached. No Checkout or payment was started.",
      );
      setMessage(failure);
      publishNotice({ kind: "error", message: failure });
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }

  const prixCourant = priceFor(currentPlan, sub.billingCycle, sub.currency);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={t("Abonnement", "Subscription")}
        title={t("Abonnement & facturation", "Subscription & billing")}
        description={t("Votre plan, votre consommation et vos factures. Sans rapport avec les loyers que vous encaissez.", "Your plan, usage and invoices. This is separate from the rent you collect.")}
      />
      {notice ? <div className={`billing-notice billing-notice--${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"} aria-live="polite">{notice.message}</div> : null}

      {rentalMarket?.country === "CI" && sub.currency !== "XOF" ? (
        <p className="form-feedback form-feedback--error" role="alert">{t(
          "Cette Organization ivoirienne conserve une ancienne configuration d’abonnement. Son historique n’a pas été réécrit : une revue supervisée est requise avant tout forfait payant.",
          "This Ivorian Organization keeps a legacy subscription configuration. Its history was not rewritten: supervised review is required before any paid plan.",
        )}</p>
      ) : null}

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
                <option value="CI">{t("Côte d’Ivoire", "Ivory Coast")} · XOF</option>
              </select>
            </label>
          </div>
          {requestedBillingCountry ? <p><strong>{t("Devise d’abonnement", "Subscription currency")}: {subscriptionCurrencyForBillingCountry(requestedBillingCountry)}</strong></p> : null}
          {rentalMarket && requestedBillingCountry && rentalMarket.country !== requestedBillingCountry ? (
            <p className="form-feedback" role="status">{t(
              `Marché locatif : ${rentalMarket.country}/${rentalMarket.currency}. Abonnement KJORA : ${requestedBillingCountry}/${subscriptionCurrencyForBillingCountry(requestedBillingCountry)}. Ces devises restent séparées.`,
              `Rental market: ${rentalMarket.country}/${rentalMarket.currency}. KJORA subscription: ${requestedBillingCountry}/${subscriptionCurrencyForBillingCountry(requestedBillingCountry)}. These currencies remain separate.`,
            )}</p>
          ) : null}
          <p><small>{requestedCanCheckout ? t(
            "Vous allez être redirigé vers la page officielle Stripe. Aucun paiement n’est effectué dans KJORA.",
            "You will be redirected to the official Stripe page. No payment is made inside KJORA.",
          ) : t(
            "Cette action prépare le changement sans masquer une éventuelle erreur de paiement.",
            "This action prepares the change without hiding any payment error.",
          )}</small></p>
          <button
            className="button button--primary"
            disabled={busy || isCurrentBillingPlan(overview, requestedPlan) || !requestedBillingCountry}
            onClick={async () => {
              if (requestedCanCheckout) {
                await openStripe("checkout", { plan: requestedPlan, cycle: requestedCycle });
                return;
              }
              if (await persistIntent(requestedCycle, requestedBillingCountry)) {
                await act({ action: "change_plan", plan: requestedPlan, cycle: requestedCycle, billing_country: requestedBillingCountry });
              }
            }}
            type="button"
          >
            {busy
              ? t("Ouverture…", "Opening…")
              : requestedCanCheckout && requestedPrice !== null
                ? checkoutLabel(requestedPlan, requestedCycle, requestedPrice)
                : t("Préparer ce plan", "Prepare this plan")}
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
            <h2>{PLAN_LABELS[currentPlan][locale]}</h2>
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
        {sub.lastPaymentState ? <p>{t("Dernier paiement", "Latest payment")}: {
          sub.lastPaymentState === "paid" ? t("reçu", "received")
            : sub.lastPaymentState === "action_required" ? t("action requise", "action required")
              : t("échoué", "failed")
        }{sub.lastPaymentAt ? ` · ${sub.lastPaymentAt.slice(0, 10)}` : ""}.</p> : null}
        {sub.scheduledPlan ? (
          <p className="form-feedback" role="status">
            {t(`Passage au plan ${PLAN_LABELS[sub.scheduledPlan].fr} prévu le ${sub.scheduledEffectiveOn}.`, `Change to the ${PLAN_LABELS[sub.scheduledPlan].en} plan scheduled for ${sub.scheduledEffectiveOn}.`)}
          </p>
        ) : null}
        {sub.pendingPlan ? (
          <p className="form-feedback" role="status">
            {t(`Changement vers ${PLAN_LABELS[sub.pendingPlan].fr} demandé. Vous pouvez le poursuivre depuis les offres ci-dessous ; aucun montant n’a été débité.`, `Change to the ${PLAN_LABELS[sub.pendingPlan].en} plan requested. You may continue it from the offers below; no amount has been charged.`)}
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
              <option value="CI">{t("Côte d’Ivoire", "Ivory Coast")} · XOF</option>
            </select>
            <small>{t(
              "Ce pays détermine la devise de l’abonnement KJORA et ne modifie jamais la devise des loyers.",
              "This country determines the KJORA subscription currency and never changes the rental currency.",
            )}</small>
          </label>
          {!requestedBillingCountry && rentalMarket && !["CA", "CM", "CI"].includes(rentalMarket.country) ? (
            <p className="form-feedback" role="status">{t(
              "Découverte reste gratuit. Aucun tarif payant local n’est encore publié pour ce pays : nous n’affichons pas de faux prix XAF.",
              "Discovery remains free. No local paid price is published for this country yet, so we do not show a misleading XAF price.",
            )}</p>
          ) : null}
          <div className="billing-plan-grid">
            {PLAN_ORDER.filter((p) => p !== currentPlan).map((p) => {
              const prix = priceFor(p, sub.billingCycle, selectedSubscriptionCurrency);
              const canCheckout = requestedBillingCountry === "CA"
                && typeof prix === "number"
                && prix > 0
                && stripeEnvironment !== null;
              return (
                <button className="billing-plan-option" disabled={busy || !requestedBillingCountry} key={p} type="button"
                  onClick={() => canCheckout
                    ? void openStripe("checkout", { plan: p, cycle: sub.billingCycle })
                    : void act({ action: "change_plan", plan: p, cycle: sub.billingCycle, billing_country: requestedBillingCountry })}>
                  <strong>{PLAN_LABELS[p][locale]}</strong>
                  <span>{prix === null ? t("Sur devis", "Quote required") : prix === 0 ? t("Gratuit", "Free") : formatAmount(prix, selectedSubscriptionCurrency)}</span>
                  {canCheckout ? <span>{t("Continuer vers Stripe", "Continue to Stripe")}</span> : null}
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
              <p><small>{affordance.online
                ? t("Votre demande est enregistrée. Vous pouvez poursuivre vers Stripe lorsque vous êtes prêt ; aucun montant n’a été débité et votre plan actuel reste inchangé.", "Your request is recorded. You may continue to Stripe when you are ready; no amount was charged and your current plan remains unchanged.")
                : t("Le règlement en ligne n’est pas disponible pour cette offre. Votre demande est enregistrée : aucun montant n’a été débité et votre plan actuel reste inchangé.", "Online payment is unavailable for this offer. Your request is recorded: no amount was charged and your current plan remains unchanged.")}
              </small></p>
            </div>
          ) : null}

          {quote?.outcome === "downgrade_refused" ? (
            <div className="billing-quote billing-quote--refused" role="alert">
              <h3>{t("Descente impossible pour l’instant", "Downgrade unavailable for now")}</h3>
              <p>{t("Votre usage dépasse les limites du plan visé :", "Your usage exceeds the target plan limits:")}</p>
              <ul>
                {quotaBlockers.map((b) => (
                  <li key={b.quota}>
                    {b.libelle ?? b.quota}: {b.actuel} {t("pour une limite de", "with a limit of")} {b.limite}
                  </li>
                ))}
              </ul>
              <p><small>{t("Rien n’a été modifié et aucune donnée n’a été supprimée.", "Nothing was changed and no data was deleted.")}</small></p>
            </div>
          ) : null}

          {quote?.outcome === "billing_market_change_blocked" ? (
            <div className="billing-quote billing-quote--refused" role="alert">
              <h3>{t("Changement de marché indisponible", "Market change unavailable")}</h3>
              <p>{marketBlockerMessage}</p>
              <p><small>{t("Aucun paiement ni Checkout Stripe n’a été lancé.", "No payment or Stripe Checkout was started.")}</small></p>
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
        {requestedBillingCountry === "CA" && checkoutPlan && typeof checkoutPrice === "number" ? (
          <>
          <button className="button button--primary" disabled={busy || marketChangeBlocked || !affordance.online} onClick={() => void openStripe("checkout", { plan: checkoutPlan, cycle: checkoutCycle })} type="button">
            {busy ? t("Ouverture…", "Opening…") : checkoutLabel(checkoutPlan, checkoutCycle, checkoutPrice)}
          </button>
          {marketChangeBlocked ? <p className="form-feedback form-feedback--error" role="alert">{marketBlockerMessage}</p> : null}
          {!marketChangeBlocked && !affordance.online ? <p className="form-feedback form-feedback--error" role="status">{affordance.reason ? (locale === "en" ? CHECKOUT_UNAVAILABLE_MESSAGES_EN[affordance.reason] : CHECKOUT_UNAVAILABLE_MESSAGES[affordance.reason]) : t("Stripe est indisponible pour le moment.", "Stripe is currently unavailable.")}</p> : null}
          </>
        ) : null}
        {sub.provider === "stripe" ? (
          <button className="button button--secondary" disabled={busy} onClick={() => void openStripe("portal")} type="button">
            {stripeEnvironment === "test" ? t("Gérer dans le portail Stripe Test", "Manage in Stripe Test portal") : t("Gérer mon abonnement", "Manage my subscription")}
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
                  <span>{facture.source === "provider" ? t("Facture d’abonnement KJORA via Stripe", "KJORA subscription invoice via Stripe") : t("Facture d’abonnement KJORA", "KJORA subscription invoice")} · {PLAN_LABELS[facture.plan][locale]} · {facture.periodStart} → {facture.periodEnd}</span>
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
      {sub.exists && sub.status === "active" && currentPlan !== "decouverte" ? (
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
