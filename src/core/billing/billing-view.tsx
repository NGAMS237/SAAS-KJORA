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
  type BillingCycle,
} from "@/core/billing/model";
import { PLAN_LABELS, type PlanSlug } from "@/core/entitlements/model";
// Types importés depuis `types.ts`, module pur. Le client ne doit jamais
// importer `server.ts`, marqué `server-only`.
import {
  CHECKOUT_UNAVAILABLE_MESSAGES,
  RECURRENCE_MESSAGES,
  type BillingCheckoutAffordance,
  type BillingInvoice,
  type BillingOverview,
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
  blockers?: Array<{ libelle?: string; quota?: string; actuel: number; limite: number }>;
};

function QuotaLine({ libelle, actuel, limite }: { libelle: string; actuel: number; limite: number | null }) {
  const depasse = limite !== null && actuel > limite;
  return (
    <div className="billing-quota">
      <span>{libelle}</span>
      <strong className={depasse ? "billing-quota--over" : undefined}>
        {actuel}{limite !== null ? ` / ${limite}` : " / illimité"}
      </strong>
    </div>
  );
}

export function BillingView({
  overview,
  invoices,
  affordance,
}: {
  overview: BillingOverview;
  invoices: BillingInvoice[];
  /** Décidé côté serveur. Le client n'apprend jamais quel provider est retenu. */
  affordance: BillingCheckoutAffordance;
}) {
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const sub = overview.subscription;
  const bloque = isBillingBlocked(sub.status);
  const avertissement = needsBillingWarning(sub.status);

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
      setMessage("L’opération n’a pas abouti. Réessayez dans un instant.");
      setBusy(false);
      return;
    }
    setQuote(body.result);
    setBusy(false);
  }

  const prixCourant = priceFor(sub.plan, sub.billingCycle, sub.currency);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Abonnement"
        title="Abonnement & facturation"
        description="Votre plan, votre consommation et vos factures. Sans rapport avec les loyers que vous encaissez."
      />

      {/* ---------------------------------------------------------- État */}
      <Card className={bloque ? "billing-state billing-state--blocked" : "billing-state"}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">État</p>
            <h2>{SUBSCRIPTION_STATUS_LABELS[sub.status]}</h2>
          </div>
          {bloque || avertissement ? <TriangleAlert size={22} /> : <CreditCard size={22} />}
        </div>
        <p>{SUBSCRIPTION_STATUS_MESSAGES[sub.status]}</p>
        {sub.graceEndsOn ? <p><strong>Tolérance jusqu’au {sub.graceEndsOn}.</strong></p> : null}
        {sub.cancellationEffectiveOn ? (
          <p><strong>Fin d’abonnement prévue le {sub.cancellationEffectiveOn}.</strong></p>
        ) : null}
        {sub.status === "cancellation_scheduled" ? (
          <button className="button button--secondary" disabled={busy}
            onClick={() => act({ action: "resume" })} type="button">
            Reprendre mon abonnement
          </button>
        ) : null}
        {sub.status === "billing_blocked" || sub.status === "cancelled" ? (
          <button className="button button--primary" disabled={busy}
            onClick={() => act({ action: "reactivate" })} type="button">
            Réactiver mon abonnement
          </button>
        ) : null}
      </Card>

      {/* ----------------------------------------------------------- Plan */}
      <Card>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Plan</p>
            <h2>{PLAN_LABELS[overview.effectivePlan].fr}</h2>
          </div>
          <Badge tone="neutral">{BILLING_CYCLE_LABELS[sub.billingCycle]}</Badge>
        </div>
        <p>
          {prixCourant === null
            ? "Ce plan fait l’objet d’un devis commercial."
            : prixCourant === 0
              ? "Gratuit, sans moyen de paiement."
              : `${formatAmount(prixCourant, sub.currency)} par ${sub.billingCycle === "annual" ? "an" : "mois"}.`}
        </p>
        {sub.renewalDate ? <p>Prochaine échéance : {sub.renewalDate}.</p> : null}
        {sub.scheduledPlan ? (
          <p className="form-feedback" role="status">
            Passage au plan {PLAN_LABELS[sub.scheduledPlan].fr} prévu le {sub.scheduledEffectiveOn}.
          </p>
        ) : null}
        {sub.pendingPlan ? (
          <p className="form-feedback" role="status">
            Changement vers {PLAN_LABELS[sub.pendingPlan].fr} demandé. Le règlement en ligne
            n’est pas encore disponible : nous revenons vers vous.
          </p>
        ) : null}
      </Card>

      {/* ---------------------------------------------------------- Usage */}
      <Card>
        <div className="section-heading">
          <div><p className="eyebrow">Consommation</p><h2>Votre usage</h2></div>
        </div>
        <div className="billing-quotas">
          <QuotaLine libelle="Biens" actuel={overview.usage.activeProperties} limite={overview.quotas.maxProperties} />
          <QuotaLine libelle="Logements actifs" actuel={overview.usage.activeUnits} limite={overview.quotas.maxActiveUnits} />
          <QuotaLine libelle="Collaborateurs" actuel={overview.usage.collaborators} limite={overview.quotas.maxCollaborators} />
          <QuotaLine libelle="Organisations" actuel={overview.usage.organizations} limite={overview.quotas.maxOrganizations} />
        </div>
      </Card>

      {/* --------------------------------------------------- Changer de plan */}
      {!bloque ? (
        <Card>
          <div className="section-heading">
            <div><p className="eyebrow">Changer</p><h2>Changer de plan</h2></div>
          </div>
          <div className="billing-plan-grid">
            {PLAN_ORDER.filter((p) => p !== overview.effectivePlan).map((p) => {
              const prix = priceFor(p, sub.billingCycle, sub.currency);
              return (
                <button className="billing-plan-option" disabled={busy} key={p} type="button"
                  onClick={() => act({ action: "change_plan", plan: p, cycle: sub.billingCycle })}>
                  <strong>{PLAN_LABELS[p].fr}</strong>
                  <span>{prix === null ? "Sur devis" : prix === 0 ? "Gratuit" : formatAmount(prix, sub.currency)}</span>
                </button>
              );
            })}
          </div>
          <p><small>
            Une montée en gamme prend effet immédiatement après règlement, au prorata du temps
            restant. Une descente prend effet à la fin de la période déjà payée, et seulement si
            votre usage tient dans les quotas du plan visé. Aucune donnée n’est jamais supprimée.
          </small></p>

          {quote?.outcome === "upgrade_intent_recorded" ? (
            <div className="billing-quote" role="status">
              <h3>Estimation</h3>
              <p>
                {typeof quote.amountDueMinor === "number"
                  ? `${formatAmount(quote.amountDueMinor, sub.currency)} pour les ${quote.daysRemaining} jours restants.`
                  : "Estimation indisponible."}
              </p>
              <p><small>
                Le règlement en ligne n’est pas encore disponible. Votre demande est enregistrée :
                aucun montant n’a été débité et votre plan actuel reste inchangé.
              </small></p>
            </div>
          ) : null}

          {quote?.outcome === "downgrade_refused" ? (
            <div className="billing-quote billing-quote--refused" role="alert">
              <h3>Descente impossible pour l’instant</h3>
              <p>Votre usage dépasse les limites du plan visé :</p>
              <ul>
                {(quote.blockers ?? []).map((b) => (
                  <li key={b.quota}>
                    {b.libelle ?? b.quota} : {b.actuel} pour une limite de {b.limite}
                  </li>
                ))}
              </ul>
              <p><small>Rien n’a été modifié et aucune donnée n’a été supprimée.</small></p>
            </div>
          ) : null}

          {quote?.outcome === "downgrade_scheduled" ? (
            <div className="billing-quote" role="status">
              <h3>Changement programmé</h3>
              <p>Votre plan changera le {quote.effectiveOn}, à la fin de la période déjà réglée.</p>
            </div>
          ) : null}

          {quote?.outcome === "quote_required" ? (
            <div className="billing-quote" role="status">
              <h3>Sur mesure</h3>
              <p>Ce plan passe par un échange commercial plutôt que par une souscription en ligne.</p>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* ----------------------------------------------- Moyen de paiement */}
      <Card>
        <div className="section-heading">
          <div><p className="eyebrow">Règlement</p><h2>Moyen de paiement</h2></div>
          <CreditCard size={22} />
        </div>
        {sub.paymentMethodLast4 ? (
          <p>{sub.paymentMethodBrand ?? "Carte"} ···· {sub.paymentMethodLast4}
            {sub.paymentMethodExpiresOn ? ` · expire le ${sub.paymentMethodExpiresOn}` : ""}</p>
        ) : (
          <p>Aucun moyen de paiement enregistré.</p>
        )}
        <p>
          {affordance.online && affordance.recurrence
            ? RECURRENCE_MESSAGES[affordance.recurrence]
            : affordance.reason
              ? CHECKOUT_UNAVAILABLE_MESSAGES[affordance.reason]
              : null}
        </p>
      </Card>

      {/* -------------------------------------------------------- Factures */}
      <Card>
        <div className="section-heading">
          <div><p className="eyebrow">Historique</p><h2>Factures</h2></div>
          <ReceiptText size={22} />
        </div>
        {invoices.length ? (
          <div className="billing-invoice-list">
            {invoices.map((facture) => (
              <div className="billing-invoice-row" key={facture.id}>
                <div>
                  <strong>{facture.number}</strong>
                  <span>{PLAN_LABELS[facture.plan].fr} · {facture.periodStart} → {facture.periodEnd}</span>
                </div>
                <span className="financial-value">{formatAmount(facture.amountMinor, facture.currency)}</span>
                <Badge tone={facture.status === "paid" ? "success" : "neutral"}>
                  {INVOICE_STATUS_LABELS[facture.status]}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ReceiptText}
            title="Aucune facture"
            description="Découverte est gratuit : aucune facture n’est émise tant que vous n’avez pas d’abonnement payant."
          />
        )}
      </Card>

      {/* ------------------------------------------------------ Annulation */}
      {sub.status === "active" ? (
        <Card muted>
          <h2>Annuler l’abonnement</h2>
          <p>
            Vous conservez l’accès complet jusqu’à la fin de la période déjà réglée. Aucun
            remboursement n’est effectué et vos données sont conservées.
          </p>
          <button className="button button--secondary" disabled={busy}
            onClick={() => act({ action: "cancel" })} type="button">
            Annuler à l’échéance
          </button>
        </Card>
      ) : null}

      {message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}
    </div>
  );
}
