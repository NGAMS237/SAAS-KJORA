"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { usePreferences } from "@/core/preferences/preferences-provider";
import {
  reconcileDueNoticesAction,
  resolveDeliveryReviewAction,
  retryFailedDeliveriesAction,
  runCommunicationsAction,
  type DeliveryReviewDecision,
  type OperationsActionResult,
} from "@/modules/platform-admin/operations-actions";

// =============================================================================
// NCE-01 — Vue Admin « Opérations » : compteurs uniquement. Jamais une
// adresse complète, un sujet, un corps de message, un payload ni un secret.
// =============================================================================

export type OperationsOverview = {
  dbCronLastRun: { status?: string; startedAt?: string; finishedAt?: string } | null;
  lastDailyRun: { status?: string; dryRun?: boolean; trigger?: string; startedAt?: string; finishedAt?: string } | null;
  automaticInvoices30d: number;
  dueNotices30d: number;
  missingDueNotices: number;
  rentDeliveries: Record<string, number>;
  saasDeliveries: Record<string, number>;
  saasDeliveriesHeldForLegalIdentity: number;
  retryableFailures: number;
  retryableFailuresDueNow: number;
  deliveryUnknown: number;
  providerFailed: number;
  deliveryDelayedAwaitingOutcome: number;
  providerEvents30d: Record<string, number>;
  organizationsWithoutCommunicationSettings: number;
  generatedAt: string | null;
};

export type OperationRun = {
  runId: string; runType: string; triggerSource: string; dryRun: boolean; actorEmailMasked: string | null;
  runOn: string; status: string; startedAt: string; finishedAt: string | null;
};

export type DeliveryReview = {
  queue: "rent" | "saas"; deliveryId: string; organizationName: string; templateKey: string;
  recipientMasked: string | null; attemptCount: number; resendGeneration: number;
  reviewReason: string; lastErrorCode: string | null; updatedAt: string;
};

export type ProviderEvent = { eventType: string; matchedQueue: string | null; outcome: string; receivedAt: string };

export type OperationsConfig = {
  emailOperational: boolean;
  missingEmailVariables: string[];
  senderAddress: string | null;
  saasAutoInvoicing: boolean;
  webhookSecretConfigured: boolean;
  cronSecretConfigured: boolean;
  legalIdentityConfigured: boolean;
};

const STATUSES = [
  "pending", "processing", "sent", "delivered", "failed", "delivery_unknown", "provider_failed",
  "bounced", "complained", "suppressed", "cancelled",
] as const;

const EVENT_TYPES = [
  "email.sent", "email.delivered", "email.delivery_delayed", "email.failed",
  "email.bounced", "email.complained", "email.suppressed",
] as const;

function formatDateTime(value: string | null | undefined, lang: "fr" | "en") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Douala" }).format(date);
}

function Counter({ label, value }: { label: string; value: number | string }) {
  return <div className="admin-counter"><span className="admin-counter__value">{value}</span><span className="admin-counter__label">{label}</span></div>;
}

export function OperationsView({ overview, runs, reviews, events, config, error }: {
  overview: OperationsOverview | null; runs: OperationRun[] | null; reviews: DeliveryReview[] | null;
  events: ProviderEvent[] | null; config: OperationsConfig; error: "denied" | "failed" | null;
}) {
  const { language } = usePreferences();
  const lang = language === "EN" ? "en" : "fr";
  const t = (fr: string, en: string) => lang === "fr" ? fr : en;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmReal, setConfirmReal] = useState(false);
  const [result, setResult] = useState<{ kind: "success" | "error"; title: string; detail: string } | null>(null);
  const [reviewTarget, setReviewTarget] = useState<DeliveryReview | null>(null);
  const [reviewDecision, setReviewDecision] = useState<DeliveryReviewDecision>("abandon");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewMessageId, setReviewMessageId] = useState("");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);

  function submitReview() {
    if (!reviewTarget) return;
    startTransition(async () => {
      show(t("Décision de revue", "Review decision"), await resolveDeliveryReviewAction(
        reviewTarget.queue, reviewTarget.deliveryId, reviewDecision, reviewNote, reviewMessageId,
      ));
      setReviewTarget(null); setReviewNote(""); setReviewMessageId(""); setReviewConfirmed(false);
    });
  }

  const reasonLabel: Record<string, string> = {
    ambiguous_provider_response: t("Réponse fournisseur ambiguë (délai, 5xx…)", "Ambiguous provider response (timeout, 5xx…)"),
    worker_lease_expired: t("Interruption après le début de l’envoi", "Interrupted after sending started"),
    finalization_failed: t("Accepté par le fournisseur, non enregistré", "Accepted by provider, not recorded"),
  };

  function show(title: string, outcome: OperationsActionResult) {
    if (!outcome.ok) {
      setResult({ kind: "error", title, detail: outcome.reason === "denied" ? t("Action réservée aux administrateurs plateforme.", "Platform administrators only.") : t("L’opération a échoué. Réessayez plus tard.", "The operation failed. Please try again later.") });
      return;
    }
    setResult({ kind: "success", title, detail: JSON.stringify(outcome.detail, null, 2) });
    router.refresh();
  }

  function run(dryRun: boolean) {
    startTransition(async () => {
      show(dryRun ? t("Simulation (dry-run)", "Simulation (dry-run)") : t("Exécution réelle", "Real run"), await runCommunicationsAction(dryRun));
      setConfirmReal(false);
    });
  }

  const typeLabel: Record<string, string> = {
    communications_daily: t("Passage quotidien", "Daily run"),
    due_notice_reconciliation: t("Réconciliation des avis", "Notice reconciliation"),
    retry_failed_deliveries: t("Relance des échecs", "Failed delivery retry"),
    delivery_review: t("Décision de revue", "Review decision"),
  };

  return <div className="admin-page">
    <header className="admin-page__header">
      <h1>{t("Opérations", "Operations")}</h1>
      <p>{t("Cron quotidien, factures SaaS automatiques, avis d’échéance et files de courriels. Compteurs uniquement.", "Daily cron, automatic SaaS invoices, due notices and email queues. Counters only.")}</p>
    </header>

    {error ? <p className="admin-error" role="alert">{error === "denied" ? t("Accès refusé.", "Access denied.") : t("Lecture impossible pour le moment.", "Unable to load right now.")}</p> : null}

    <section className="admin-section" aria-labelledby="ops-config-heading">
      <h2 id="ops-config-heading">{t("Configuration (noms de variables seulement)", "Configuration (variable names only)")}</h2>
      <div className="admin-table-wrap"><table className="admin-table"><tbody>
        <tr><th scope="row">{t("Envoi de courriels", "Email delivery")}</th><td>{config.emailOperational ? t("Opérationnel", "Operational") : `${t("Inactif — manquant :", "Inactive — missing:")} ${config.missingEmailVariables.join(", ")}`}</td></tr>
        <tr><th scope="row">{t("Expéditeur", "Sender")}</th><td>{config.senderAddress ?? "—"}</td></tr>
        <tr><th scope="row">KJORA_SAAS_AUTO_INVOICING_ENABLED</th><td>{config.saasAutoInvoicing ? t("Activé (écriture réelle)", "Enabled (real writes)") : t("Désactivé (dry-run)", "Disabled (dry-run)")}</td></tr>
        <tr><th scope="row">RESEND_WEBHOOK_SECRET</th><td>{config.webhookSecretConfigured ? t("Configuré", "Configured") : t("Absent", "Missing")}</td></tr>
        <tr><th scope="row">CRON_SECRET</th><td>{config.cronSecretConfigured ? t("Configuré", "Configured") : t("Absent ou trop court", "Missing or too short")}</td></tr>
        <tr><th scope="row">{t("Identité légale de facturation", "Billing legal identity")}</th><td>{config.legalIdentityConfigured ? t("Configurée", "Configured") : t("Absente — courriels SaaS retenus (documents provisoires)", "Missing — SaaS emails held (provisional documents)")}</td></tr>
      </tbody></table></div>
    </section>

    {overview ? <>
      <section className="admin-section" aria-labelledby="ops-runs-heading">
        <h2 id="ops-runs-heading">{t("Dernières exécutions", "Latest runs")}</h2>
        <div className="admin-counters">
          <Counter label={t("Cron base (échéances) — dernier statut", "DB cron (dues) — last status")} value={overview.dbCronLastRun?.status ?? t("inconnu", "unknown")} />
          <Counter label={t("Cron base — début", "DB cron — started")} value={formatDateTime(overview.dbCronLastRun?.startedAt, lang)} />
          <Counter label={t("Passage quotidien — statut", "Daily run — status")} value={overview.lastDailyRun ? `${overview.lastDailyRun.status ?? "—"}${overview.lastDailyRun.dryRun ? " (dry-run)" : ""}` : "—"} />
          <Counter label={t("Passage quotidien — début", "Daily run — started")} value={formatDateTime(overview.lastDailyRun?.startedAt, lang)} />
        </div>
      </section>

      <section className="admin-section" aria-labelledby="ops-counters-heading">
        <h2 id="ops-counters-heading">{t("Documents et factures", "Documents and invoices")}</h2>
        <div className="admin-counters">
          <Counter label={t("Factures SaaS automatiques (30 j)", "Automatic SaaS invoices (30 d)")} value={overview.automaticInvoices30d} />
          <Counter label={t("Avis d’échéance créés (30 j)", "Due notices created (30 d)")} value={overview.dueNotices30d} />
          <Counter label={t("Avis manquants", "Missing notices")} value={overview.missingDueNotices} />
          <Counter label={t("Organizations sans réglages de communication", "Organizations without communication settings")} value={overview.organizationsWithoutCommunicationSettings} />
        </div>
      </section>

      <section className="admin-section" aria-labelledby="ops-deliveries-heading">
        <h2 id="ops-deliveries-heading">{t("Files de courriels", "Email queues")}</h2>
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th scope="col">{t("Statut", "Status")}</th><th scope="col">{t("Loyers", "Rent")}</th><th scope="col">SaaS</th></tr></thead>
          <tbody>{STATUSES.map((status) => <tr key={status}><td>{status}</td><td className="admin-table__num">{overview.rentDeliveries[status] ?? 0}</td><td className="admin-table__num">{overview.saasDeliveries[status] ?? 0}</td></tr>)}</tbody>
        </table></div>
        <div className="admin-counters">
          <Counter label={t("Issue inconnue — revue Admin requise", "Unknown outcome — Admin review required")} value={overview.deliveryUnknown} />
          <Counter label={t("Échecs fournisseur (email.failed)", "Provider failures (email.failed)")} value={overview.providerFailed} />
          <Counter label={t("Retardés, en attente d’issue", "Delayed, awaiting outcome")} value={overview.deliveryDelayedAwaitingOutcome} />
          <Counter label={t("Relançables", "Retryable")} value={overview.retryableFailures} />
        </div>
        <p className="admin-section__lead">{t(
          `${overview.retryableFailures} échec(s) relançable(s), dont ${overview.retryableFailuresDueNow} éligible(s) maintenant : envoi au prochain passage quotidien ou déclenchement Admin (le délai 5/30/120 min n’est qu’un minimum). ${overview.saasDeliveriesHeldForLegalIdentity} courriel(s) SaaS retenu(s) faute d’identité légale. Les lignes « issue inconnue » ne repartent JAMAIS automatiquement.`,
          `${overview.retryableFailures} retryable failure(s), ${overview.retryableFailuresDueNow} eligible now: sent at the next daily run or Admin trigger (the 5/30/120 min delay is only a minimum). ${overview.saasDeliveriesHeldForLegalIdentity} SaaS email(s) held for missing legal identity. “Unknown outcome” rows are NEVER resent automatically.`,
        )}</p>
      </section>

      <section className="admin-section" aria-labelledby="ops-events-heading">
        <h2 id="ops-events-heading">{t("Événements fournisseur (30 j)", "Provider events (30 d)")}</h2>
        <div className="admin-counters">
          {EVENT_TYPES.map((type) => <Counter key={type} label={type} value={overview.providerEvents30d[type] ?? 0} />)}
        </div>
      </section>
    </> : null}

    <section className="admin-section" aria-labelledby="ops-reviews-heading">
      <h2 id="ops-reviews-heading">{t("Envois à l’issue inconnue", "Deliveries with unknown outcome")}</h2>
      <p className="admin-section__lead">{t(
        "Le fournisseur a peut-être accepté ces courriels. Vérifiez dans le tableau de bord Resend avant de décider. « Ré-expédier » accepte un risque de doublon ; la décision et son motif sont audités.",
        "The provider may have accepted these emails. Check the Resend dashboard before deciding. “Resend” accepts a duplicate risk; the decision and its reason are audited.",
      )}</p>
      {reviews && reviews.length ? <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th scope="col">{t("File", "Queue")}</th><th scope="col">Organization</th><th scope="col">{t("Gabarit", "Template")}</th><th scope="col">{t("Destinataire", "Recipient")}</th><th scope="col">{t("Motif", "Reason")}</th><th scope="col">{t("Depuis", "Since")}</th><th scope="col">{t("Action", "Action")}</th></tr></thead>
        <tbody>{reviews.map((row) => <tr key={`${row.queue}:${row.deliveryId}`}>
          <td>{row.queue === "rent" ? t("Loyers", "Rent") : "SaaS"}</td><td>{row.organizationName || "—"}</td><td>{row.templateKey}</td>
          <td className="admin-table__muted">{row.recipientMasked ?? "—"}</td><td>{reasonLabel[row.reviewReason] ?? row.reviewReason}</td>
          <td>{formatDateTime(row.updatedAt, lang)}</td>
          <td><button className="admin-action-button" disabled={isPending} onClick={() => { setReviewTarget(row); setReviewDecision("abandon"); setReviewConfirmed(false); }} type="button">{t("Décider", "Decide")}</button></td>
        </tr>)}</tbody>
      </table></div> : <p className="admin-table__muted">{t("Aucun envoi en revue.", "No delivery under review.")}</p>}
      {reviewTarget ? <div className="admin-dialog__body" role="group" aria-label={t("Décision de revue", "Review decision")}>
        <fieldset className="admin-dialog__field">
          <legend>{t("Décision", "Decision")}</legend>
          <label><input checked={reviewDecision === "abandon"} name="review-decision" onChange={() => setReviewDecision("abandon")} type="radio" /> {t("Abandonner (aucune nouvelle expédition)", "Abandon (no new delivery)")}</label>
          <label><input checked={reviewDecision === "confirm_sent"} name="review-decision" onChange={() => setReviewDecision("confirm_sent")} type="radio" /> {t("Confirmer envoyé (identifiant Resend constaté)", "Confirm sent (Resend ID verified)")}</label>
          <label><input checked={reviewDecision === "resend"} name="review-decision" onChange={() => setReviewDecision("resend")} type="radio" /> {t("Ré-expédier (risque de doublon accepté)", "Resend (duplicate risk accepted)")}</label>
        </fieldset>
        {reviewDecision === "confirm_sent" ? <label className="admin-dialog__field">{t("Identifiant de message Resend", "Resend message ID")}<input className="admin-filters__input" onChange={(event) => setReviewMessageId(event.target.value)} value={reviewMessageId} /></label> : null}
        <label className="admin-dialog__field">{t("Motif (obligatoire, audité)", "Reason (required, audited)")}<textarea className="admin-filters__input" maxLength={500} onChange={(event) => setReviewNote(event.target.value)} value={reviewNote} /></label>
        <label className="admin-dialog__confirm"><input checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} type="checkbox" /> {t("Je confirme cette décision.", "I confirm this decision.")}</label>
        <div className="admin-actions-row">
          <button className="admin-action-button" disabled={isPending || !reviewConfirmed || reviewNote.trim().length < 3 || (reviewDecision === "confirm_sent" && !reviewMessageId.trim())} onClick={submitReview} type="button">{t("Enregistrer la décision", "Record decision")}</button>
          <button className="admin-action-button" disabled={isPending} onClick={() => setReviewTarget(null)} type="button">{t("Annuler", "Cancel")}</button>
        </div>
      </div> : null}
    </section>

    <section className="admin-section" aria-labelledby="ops-events-history-heading">
      <h2 id="ops-events-history-heading">{t("Historique des événements fournisseur", "Provider event history")}</h2>
      {events && events.length ? <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th scope="col">{t("Reçu", "Received")}</th><th scope="col">{t("Type", "Type")}</th><th scope="col">{t("File", "Queue")}</th><th scope="col">{t("Effet", "Effect")}</th></tr></thead>
        <tbody>{events.map((row, index) => <tr key={`${row.receivedAt}:${index}`}><td>{formatDateTime(row.receivedAt, lang)}</td><td>{row.eventType}</td><td>{row.matchedQueue ?? "—"}</td><td>{row.outcome}</td></tr>)}</tbody>
      </table></div> : <p className="admin-table__muted">{t("Aucun événement reçu.", "No event received.")}</p>}
    </section>

    <section className="admin-section" aria-labelledby="ops-actions-heading">
      <h2 id="ops-actions-heading">{t("Actions", "Actions")}</h2>
      <p className="admin-section__lead">{t("Toutes les actions sont journalisées. La simulation n’écrit rien et n’envoie rien.", "Every action is logged. Simulation writes nothing and sends nothing.")}</p>
      <div className="admin-actions-row">
        <button className="admin-action-button" disabled={isPending} onClick={() => run(true)} type="button">{t("Simuler le passage quotidien (dry-run)", "Simulate daily run (dry-run)")}</button>
        <button className="admin-action-button" disabled={isPending} onClick={() => startTransition(async () => show(t("Réconciliation (dry-run)", "Reconciliation (dry-run)"), await reconcileDueNoticesAction(true, 50)))} type="button">{t("Compter les avis manquants (dry-run)", "Count missing notices (dry-run)")}</button>
        <button className="admin-action-button" disabled={isPending || !overview || overview.retryableFailures === 0} onClick={() => startTransition(async () => show(t("Relance des échecs", "Failed delivery retry"), await retryFailedDeliveriesAction()))} type="button">{t("Rendre éligibles les échecs relançables (envoi au prochain passage)", "Make retryable failures eligible (sent at next run)")}</button>
      </div>
      <div className="admin-dialog__confirm">
        <label><input checked={confirmReal} onChange={(event) => setConfirmReal(event.target.checked)} type="checkbox" /> {t("Je confirme une exécution réelle (factures selon l’interrupteur, envoi des files si configuré).", "I confirm a real run (invoices per the switch, queues sent if configured).")}</label>
        <button className="admin-action-button" disabled={isPending || !confirmReal} onClick={() => run(false)} type="button">{t("Exécuter réellement", "Run for real")}</button>
        <button className="admin-action-button" disabled={isPending || !confirmReal} onClick={() => startTransition(async () => { show(t("Réconciliation réelle (sans courriel)", "Real reconciliation (no email)"), await reconcileDueNoticesAction(false, 50)); setConfirmReal(false); })} type="button">{t("Créer les avis manquants (50, sans courriel)", "Create missing notices (50, no email)")}</button>
      </div>
      {result ? <div className={result.kind === "error" ? "admin-error" : "admin-state"} role={result.kind === "error" ? "alert" : "status"}><strong>{result.title}</strong><pre className="admin-ops-result">{result.detail}</pre></div> : null}
    </section>

    <section className="admin-section" aria-labelledby="ops-history-heading">
      <h2 id="ops-history-heading">{t("Historique audité", "Audited history")}</h2>
      {runs && runs.length ? <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th scope="col">{t("Début", "Started")}</th><th scope="col">{t("Type", "Type")}</th><th scope="col">{t("Déclencheur", "Trigger")}</th><th scope="col">{t("Mode", "Mode")}</th><th scope="col">{t("Statut", "Status")}</th><th scope="col">{t("Acteur", "Actor")}</th></tr></thead>
        <tbody>{runs.map((row) => <tr key={row.runId}><td>{formatDateTime(row.startedAt, lang)}</td><td>{typeLabel[row.runType] ?? row.runType}</td><td>{row.triggerSource}</td><td>{row.dryRun ? "dry-run" : t("réel", "real")}</td><td>{row.status}</td><td className="admin-table__muted">{row.actorEmailMasked ?? "—"}</td></tr>)}</tbody>
      </table></div> : <p className="admin-table__muted">{t("Aucune exécution journalisée.", "No logged run.")}</p>}
    </section>
  </div>;
}
