"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, CircleDollarSign, Coins, FileText, WalletCards } from "lucide-react";
import { usePreferences } from "@/core/preferences/preferences-provider";
import { Badge, Card, EmptyState, FinancialStateCard, PageHeader } from "@/core/ui/ui";
import { dueBreakdown, type DueStatus, type LeaseFinancialDetail, type LedgerEntrySummary, type TenantFinancialDetail, type TenantFinancialPosition } from "@/modules/finance/model";
import type { FinancialDocumentSummary } from "@/modules/documents/model";
import { StatementPdfAction } from "@/modules/documents/views";

function useCopy() {
  const { language } = usePreferences();
  return (fr: string, en: string) => language === "FR" ? fr : en;
}

function money(value: number) {
  return `${value.toLocaleString("fr-FR")} XAF`;
}

function shortDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function status(statusValue: DueStatus, t: ReturnType<typeof useCopy>) {
  const labels: Record<DueStatus, [string, string, "neutral" | "success" | "warning" | "danger" | "info" | "due"]> = {
    upcoming: ["À venir", "Upcoming", "info"], due: ["À régler", "Due", "due"],
    overdue: ["En retard", "Overdue", "danger"], covered: ["Couverte par crédit", "Covered by credit", "success"],
    partially_paid: ["Partiellement payée", "Partially paid", "warning"], paid: ["Payée", "Paid", "success"],
    cancelled: ["Annulée", "Cancelled", "neutral"], adjusted: ["Ajustement", "Adjustment", "warning"],
  };
  const [fr, en, tone] = labels[statusValue];
  return <Badge tone={tone}>{t(fr, en)}</Badge>;
}

function operationLabel(entry: LedgerEntrySummary, t: ReturnType<typeof useCopy>) {
  const labels: Record<LedgerEntrySummary["type"], [string, string]> = {
    rent: ["Loyer", "Rent"], recurring_charge: ["Charges récurrentes", "Recurring charges"],
    initial_prorata: ["Prorata d’entrée", "Entry prorata"], deposit: ["Dépôt de garantie", "Security deposit"],
    adjustment: ["Ajustement", "Adjustment"], opening_credit: ["Crédit initial validé", "Validated opening credit"],
    payment: ["Paiement reçu", "Payment received"], payment_reversal: ["Annulation de paiement", "Payment reversal"],
  };
  const [fr, en] = labels[entry.type];
  return t(fr, en);
}

export function TenantFinancialSummary({ tenantId, financial }: { tenantId?: string; financial: TenantFinancialPosition }) {
  const t = useCopy();
  const debt = financial.amountDueXaf > 0;
  const mainLabel = debt ? t("Solde dû", "Amount due") : t("À jour", "Up to date");
  const mainValue = money(debt ? financial.amountDueXaf : 0);
  return <Card className="tenant-financial-preview-v2 financial-truth-card">
    <div className="section-heading"><div><p className="eyebrow">Ledger</p><h2>{t("Situation financière réelle", "Live financial position")}</h2></div><WalletCards size={22} /></div>
    <p>{t("Solde calculé à partir des échéances, des charges et du crédit d’ouverture validé — aucun paiement n’est enregistré automatiquement.", "Derived from dues, charges and validated opening credit — no payment is recorded automatically.")}</p>
    <div className="financial-state-grid">
      <FinancialStateCard icon={CircleDollarSign} label={mainLabel} value={mainValue} helper={debt ? t("Échéances arrivées à date et restant dues.", "Dues reached and still outstanding.") : t("Aucune dette arrivée à date.", "No debt currently due.")} tone={debt ? "danger" : "positive"} />
      <FinancialStateCard icon={WalletCards} label={t("Crédit disponible", "Available credit")} value={money(financial.availableCreditXaf)} helper={financial.availableCreditXaf > 0 ? t("Crédit d’ouverture et trop-perçus réels après couverture.", "Opening credit and real overpayments remaining after coverage.") : t("Aucun crédit disponible.", "No available credit.")} tone="positive" />
      <FinancialStateCard icon={Coins} label={t("Périodes couvertes", "Covered periods")} value={String(financial.coveredPeriods)} helper={financial.lastCoveredPeriodEnd ? t(`Dernière période prépayée : ${shortDate(financial.lastCoveredPeriodEnd)}`, `Last prepaid period: ${shortDate(financial.lastCoveredPeriodEnd)}`) : t("Aucune période entièrement couverte.", "No fully covered period.")} tone="positive" />
      <FinancialStateCard icon={CalendarClock} label={t("Prochaine échéance non couverte", "Next uncovered due")} value={shortDate(financial.nextUncoveredDueDate)} helper={financial.nextUncoveredDueDate ? t("Montant restant visible dans le détail.", "Outstanding amount is visible in details.") : financial.nextDueDate ? t("Toutes les échéances générées sont couvertes.", "All generated dues are covered.") : t("Aucune échéance à venir générée.", "No generated upcoming due.")} tone="info" />
    </div>
    <div className="financial-summary-actions"><span>{t("Dernière opération", "Last operation")} · {shortDate(financial.lastLedgerDate)}</span>{tenantId ? <Link className="button button--secondary" href={`/app/locataires/${tenantId}/etat-de-compte`}><FileText size={16} />{t("Voir l’état de compte", "View statement")}</Link> : null}</div>
  </Card>;
}

function daysBetween(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000));
}

// Nouvelle échéance : avis émis depuis moins de 7 jours et pas encore réglée.
function isFreshNotice(due: { status: DueStatus; noticeDate: string }, today: string) {
  return (due.status === "upcoming" || due.status === "due") && due.noticeDate <= today && daysBetween(due.noticeDate, today) <= 7;
}

function dueRowTone(due: { status: DueStatus; noticeDate: string }, today: string) {
  if (due.status === "overdue") return "overdue";
  if (due.status === "partially_paid") return "partial";
  if (due.status === "due") return "due";
  if (isFreshNotice(due, today)) return "fresh";
  if (due.status === "paid" || due.status === "covered" || due.status === "cancelled") return "settled";
  return "upcoming";
}

export function LeaseDuesPanel({ financial, tenantScope = false }: { financial: LeaseFinancialDetail; tenantScope?: boolean }) {
  const t = useCopy();
  const today = new Date().toISOString().slice(0, 10);
  const dues = financial.dues.filter((due) => due.kind !== "adjustment" || due.adjustmentXaf > 0);
  const overdueDues = dues.filter((due) => due.status === "overdue");
  const overdueXaf = overdueDues.reduce((sum, due) => sum + dueBreakdown(due).remainingXaf, 0);
  return <Card className="dues-card" id="echeances">
    <div className="section-heading"><div><p className="eyebrow">{t("Échéances", "Dues")}</p><h2>{tenantScope ? t("Ventilation des échéances", "Due breakdown") : t("Échéances", "Dues")}</h2></div><CalendarClock size={22} /></div>
    {overdueDues.length ? <div className="due-alert" role="alert"><strong>{t(`${overdueDues.length} échéance(s) en retard · ${money(overdueXaf)}`, `${overdueDues.length} overdue due(s) · ${money(overdueXaf)}`)}</strong><span>{t(`La plus ancienne date du ${shortDate(overdueDues.reduce((min, due) => due.dueDate < min ? due.dueDate : min, overdueDues[0].dueDate))}.`, `The oldest is from ${shortDate(overdueDues.reduce((min, due) => due.dueDate < min ? due.dueDate : min, overdueDues[0].dueDate))}.`)}</span></div> : null}
    {dues.length ? <div className="financial-table" role="table">
      <div className="financial-table__head" role="row"><span>{t("Période", "Period")}</span><span>{t("Date limite", "Due date")}</span><span>{t("Loyer", "Rent")}</span><span>{t("Charges", "Charges")}</span><span>{t("Total", "Total")}</span><span>{t("Restant", "Remaining")}</span><span>{t("État", "Status")}</span></div>
      {dues.map((due) => { const breakdown = dueBreakdown(due); const deposit = due.kind === "deposit"; const tone = dueRowTone(due, today); const late = due.status === "overdue" ? daysBetween(due.dueDate, today) : 0; const fresh = isFreshNotice(due, today); return <div className={`financial-table__row financial-table__row--${tone}${deposit ? " financial-table__row--deposit" : ""}`} role="row" key={due.id}>
        <span data-label={deposit ? t("Nature", "Type") : t("Période", "Period")}><strong>{deposit ? t("Dépôt de garantie", "Security deposit") : `${shortDate(due.periodStart)} → ${shortDate(due.periodEnd)}`}</strong><small>{due.reference}</small></span>
        <span data-label={t("Date limite", "Due date")}>{shortDate(due.dueDate)}{late > 0 ? <small className="due-late">{t(`${late} jour(s) de retard`, `${late} day(s) late`)}</small> : fresh ? <small className="due-fresh">{t("Nouvelle échéance", "New due")}</small> : <small>{due.noticeDate <= today ? t(`Avis émis le ${shortDate(due.noticeDate)}`, `Notice issued ${shortDate(due.noticeDate)}`) : t(`Avis prévu le ${shortDate(due.noticeDate)}`, `Notice scheduled for ${shortDate(due.noticeDate)}`)}</small>}</span>
        <span data-label={t("Loyer", "Rent")} className="financial-value">{deposit ? "—" : money(due.rentXaf)}</span>
        <span data-label={t("Charges", "Charges")} className="financial-value">{deposit ? "—" : money(due.recurringChargesXaf)}</span>
        <span data-label={t("Total", "Total")} className="financial-value">{money(breakdown.totalXaf)}</span>
        <span data-label={t("Reste dû", "Remaining due")} className="financial-value">{money(breakdown.remainingXaf)}</span>
        <span data-label={t("État", "Status")}>{deposit && ["upcoming", "due", "overdue"].includes(due.status) ? <Badge tone={due.status === "overdue" ? "danger" : "due"}>{t("À encaisser", "To collect")}</Badge> : status(due.status, t)}</span>
        <details className="due-breakdown">
          <summary>{t("Comment ce montant est calculé ?", "How is this amount calculated?")}</summary>
          <div className="due-breakdown__values">
            <span><small>{t("Total de l’échéance", "Due total")}</small><strong>{money(breakdown.totalXaf)}</strong></span>
            <span><small>{t("Crédit appliqué", "Credit applied")}</small><strong>{money(breakdown.creditAppliedXaf)}</strong></span>
            <span><small>{t("Paiements reçus", "Payments received")}</small><strong>{money(breakdown.paymentsReceivedXaf)}</strong></span>
            <span><small>{t("Reste dû", "Remaining due")}</small><strong>{money(breakdown.remainingXaf)}</strong></span>
          </div>
          <p>{t(
            `Total ${money(breakdown.totalXaf)} − Crédit appliqué ${money(breakdown.creditAppliedXaf)} − Paiements reçus ${money(breakdown.paymentsReceivedXaf)} = ${money(breakdown.remainingXaf)} restant`,
            `Total ${money(breakdown.totalXaf)} − Credit applied ${money(breakdown.creditAppliedXaf)} − Payments received ${money(breakdown.paymentsReceivedXaf)} = ${money(breakdown.remainingXaf)} remaining`,
          )}</p>
          {!breakdown.reconciles ? <p className="form-feedback form-feedback--error">{t("La projection financière doit être actualisée.", "The financial projection must be refreshed.")}</p> : null}
        </details>
      </div>; })}
    </div> : <EmptyState icon={CalendarClock} title={t("Aucune échéance générée", "No generated dues")} description={t("Le moteur créera la première échéance à la date J-X prévue par le bail.", "The engine will create the first due on the lease J-X date.")} />}
  </Card>;
}

export function LedgerStatementView({ tenantId, tenantName, financial, statementDocuments }: { tenantId: string; tenantName: string; financial: TenantFinancialDetail; statementDocuments: FinancialDocumentSummary[] }) {
  const t = useCopy();
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [type, setType] = useState("all");
  const entries = useMemo(() => financial.ledger.filter((entry) => (!from || entry.occurredOn >= from) && (!to || entry.occurredOn <= to) && (type === "all" || entry.type === type)), [financial.ledger, from, to, type]);
  return <div className="page-stack statement-page">
    <PageHeader eyebrow={t("Locataire", "Tenant")} title={t("État de compte", "Account statement")} description={tenantName} />
    <TenantFinancialSummary financial={financial} />
    <StatementPdfAction initialDocuments={statementDocuments} tenantId={tenantId} />
    <Card className="statement-card">
      <div className="statement-filters"><label className="field"><span>{t("Du", "From")}</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="field"><span>{t("Au", "To")}</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><label className="field"><span>{t("Opération", "Operation")}</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">{t("Toutes", "All")}</option><option value="rent">{t("Loyer", "Rent")}</option><option value="recurring_charge">{t("Charges", "Charges")}</option><option value="initial_prorata">{t("Prorata", "Prorata")}</option><option value="deposit">{t("Dépôt", "Deposit")}</option><option value="opening_credit">{t("Crédit initial", "Opening credit")}</option><option value="payment">{t("Paiements", "Payments")}</option><option value="payment_reversal">{t("Annulations de paiement", "Payment reversals")}</option><option value="adjustment">{t("Ajustements", "Adjustments")}</option></select></label></div>
      <div className="ledger-table" role="table"><div className="ledger-table__head" role="row"><span>{t("Date", "Date")}</span><span>{t("Opération", "Operation")}</span><span>{t("Référence", "Reference")}</span><span>{t("Débit", "Debit")}</span><span>{t("Crédit", "Credit")}</span><span>{t("Solde", "Balance")}</span></div>{entries.map((entry) => <div className="ledger-table__row" role="row" key={entry.id}><span data-label={t("Date", "Date")}>{shortDate(entry.occurredOn)}</span><span data-label={t("Opération", "Operation")}><strong>{operationLabel(entry, t)}</strong>{entry.periodStart ? <small>{shortDate(entry.periodStart)} → {shortDate(entry.periodEnd)}</small> : null}</span><span data-label={t("Référence", "Reference")}>{entry.paymentId ? <Link href={`/app/paiements/${entry.paymentId}`}>{entry.reference}</Link> : entry.reference}</span><span data-label={t("Débit", "Debit")} className="financial-value">{entry.debitXaf ? money(entry.debitXaf) : "—"}</span><span data-label={t("Crédit", "Credit")} className="financial-value">{entry.creditXaf ? money(entry.creditXaf) : "—"}</span><span data-label={t("Solde", "Balance")} className="financial-value">{entry.runningBalanceXaf > 0 ? t(`Crédit ${money(entry.runningBalanceXaf)}`, `Credit ${money(entry.runningBalanceXaf)}`) : entry.runningBalanceXaf < 0 ? t(`Dû ${money(Math.abs(entry.runningBalanceXaf))}`, `Due ${money(Math.abs(entry.runningBalanceXaf))}`) : t("À jour · 0 XAF", "Current · 0 XAF")}</span></div>)}</div>
      {!entries.length ? <EmptyState title={t("Aucune opération", "No operations")} description={t("Modifiez les filtres de période ou de type.", "Change the period or operation filters.")} /> : null}
    </Card>
  </div>;
}

// Refonte — relevé de compte visible directement sur la fiche locataire (dernières opérations).
export function RecentLedgerCard({ tenantId, financial, limit = 8 }: { tenantId: string; financial: TenantFinancialDetail; limit?: number }) {
  const t = useCopy();
  const entries = financial.ledger.slice(-limit);
  const balanceLabel = (value: number) => value > 0 ? t(`Crédit ${money(value)}`, `Credit ${money(value)}`) : value < 0 ? t(`Dû ${money(Math.abs(value))}`, `Due ${money(Math.abs(value))}`) : t("À jour", "Up to date");
  return <Card id="releve" className="statement-card">
    <div className="section-heading">
      <div><p className="eyebrow">{t("Relevé de compte", "Account statement")}</p><h2>{t("Dernières opérations", "Latest operations")}</h2></div>
      <Link className="button button--secondary" href={`/app/locataires/${tenantId}/etat-de-compte`}><FileText size={16} />{t("Relevé complet et PDF", "Full statement and PDF")}</Link>
    </div>
    {entries.length ? <div className="ledger-table" role="table">
      <div className="ledger-table__head ledger-table__head--compact" role="row"><span>{t("Date", "Date")}</span><span>{t("Opération", "Operation")}</span><span>{t("Débit", "Debit")}</span><span>{t("Crédit", "Credit")}</span><span>{t("Solde", "Balance")}</span></div>
      {entries.map((entry) => <div className="ledger-table__row ledger-table__row--compact" role="row" key={entry.id}>
        <span data-label={t("Date", "Date")}>{shortDate(entry.occurredOn)}</span>
        <span data-label={t("Opération", "Operation")}><strong>{operationLabel(entry, t)}</strong>{entry.periodStart ? <small>{shortDate(entry.periodStart)} → {shortDate(entry.periodEnd)}</small> : null}</span>
        <span className="financial-value" data-label={t("Débit", "Debit")}>{entry.debitXaf ? money(entry.debitXaf) : "—"}</span>
        <span className="financial-value" data-label={t("Crédit", "Credit")}>{entry.creditXaf ? money(entry.creditXaf) : "—"}</span>
        <span className={`financial-value${entry.runningBalanceXaf < 0 ? " financial-value--negative" : ""}`} data-label={t("Solde", "Balance")}>{balanceLabel(entry.runningBalanceXaf)}</span>
      </div>)}
    </div> : <EmptyState title={t("Aucune opération", "No operations")} description={t("Les loyers et paiements apparaîtront ici.", "Rents and payments will appear here.")} />}
  </Card>;
}
