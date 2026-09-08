"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, CalendarDays, CheckCircle2, CircleDollarSign, CreditCard, Download,
  FileClock, Landmark, Plus, ReceiptText, RotateCcw, Search, Smartphone,
  UserRound, WalletCards,
} from "lucide-react";
import { usePreferences } from "@/core/preferences/preferences-provider";
import { Badge, Card, EmptyState, FinancialStateCard, PageHeader } from "@/core/ui/ui";
import {
  PAYMENT_METHODS,
  proposeInitialPaymentAllocations,
  proposePaymentAllocations,
  reconcilePaymentAllocation,
  type PaymentAllocationInput,
  type PaymentDetail,
  type PaymentLeaseOption,
  type PaymentMethod,
  type PaymentSummary,
} from "@/modules/payments/model";
import type { FinancialDocumentSummary } from "@/modules/documents/model";
import { FinancialDocumentsPanel } from "@/modules/documents/views";

function useCopy() {
  const { language } = usePreferences();
  return (fr: string, en: string) => language === "FR" ? fr : en;
}

function money(value: number) {
  return `${value.toLocaleString("fr-FR")} XAF`;
}

function shortDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function methodLabel(method: PaymentMethod, t: ReturnType<typeof useCopy>) {
  return {
    cash: t("Espèces", "Cash"),
    mtn_momo: "MTN Mobile Money",
    orange_money: "Orange Money",
    bank_transfer: t("Virement bancaire", "Bank transfer"),
    other: t("Autre", "Other"),
  }[method];
}

function paymentMethodIcon(method: PaymentMethod, size = 16) {
  if (method === "cash") return <WalletCards size={size} />;
  if (method === "bank_transfer") return <Landmark size={size} />;
  if (method === "mtn_momo" || method === "orange_money") return <Smartphone size={size} />;
  return <CreditCard size={size} />;
}

function paymentStatus(payment: PaymentSummary, t: ReturnType<typeof useCopy>) {
  return payment.status === "confirmed"
    ? <Badge tone="success">{t("Confirmé", "Confirmed")}</Badge>
    : <Badge tone="danger">{t("Annulé", "Reversed")}</Badge>;
}

function dueLabel(due: PaymentLeaseOption["dues"][number], t: ReturnType<typeof useCopy>) {
  if (due.kind === "deposit") return t("Dépôt de garantie", "Security deposit");
  if (due.kind === "initial_prorata") return t("Prorata d’entrée", "Entry prorata");
  return `${shortDate(due.periodStart)} → ${shortDate(due.periodEnd)}`;
}

function friendlyError(error: string | undefined, t: ReturnType<typeof useCopy>) {
  const messages: Record<string, [string, string]> = {
    unauthenticated: ["Votre session doit être renouvelée.", "Your session must be renewed."],
    forbidden: ["Vous n’avez pas l’autorisation pour cette action.", "You are not allowed to perform this action."],
    invalid_payment: ["Vérifiez les informations du paiement.", "Check the payment information."],
    invalid_payment_amount: ["Saisissez un montant entier supérieur à zéro.", "Enter a whole amount greater than zero."],
    future_payment_date: ["La date de réception ne peut pas être future.", "The receipt date cannot be in the future."],
    payment_allocation_exceeds_due: ["Une allocation dépasse le restant de l’échéance.", "An allocation exceeds the due remainder."],
    payment_allocation_exceeds_payment: ["Le total alloué dépasse le montant reçu.", "The allocated total exceeds the amount received."],
    idempotency_key_conflict: ["Cette confirmation a déjà été utilisée avec un autre contenu.", "This confirmation was already used with different content."],
    payment_not_reversible: ["Ce paiement ne peut plus être annulé.", "This payment can no longer be reversed."],
    payment_reversal_reason_required: ["Indiquez un motif précis.", "Provide a clear reason."],
  };
  const [fr, en] = messages[error ?? ""] ?? ["L’opération n’a pas abouti. Vérifiez l’état avant de réessayer.", "The operation did not complete. Check its state before trying again."];
  return t(fr, en);
}

async function mutate(body: Record<string, unknown>) {
  const response = await fetch("/api/payments", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return { ok: response.ok, body: await response.json().catch(() => ({})) as Record<string, unknown> };
}

export function PaymentsView({ payments, canRecord }: { payments: PaymentSummary[]; canRecord: boolean }) {
  const t = useCopy();
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("");
  const [tenantId, setTenantId] = useState("all");
  const [method, setMethod] = useState("all");
  const [status, setStatus] = useState("all");
  const tenants = useMemo(() => [...new Map(payments.map((payment) => [payment.tenantId, payment.tenantName])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1])), [payments]);
  const filtered = useMemo(() => payments.filter((payment) => {
    const haystack = `${payment.reference} ${payment.tenantName} ${payment.propertyName} ${payment.unitLabel} ${payment.externalReference ?? ""}`.toLocaleLowerCase();
    return (!query || haystack.includes(query.trim().toLocaleLowerCase()))
      && (!period || payment.paymentDate.startsWith(period))
      && (tenantId === "all" || payment.tenantId === tenantId)
      && (method === "all" || payment.method === method)
      && (status === "all" || payment.status === status);
  }), [payments, query, period, tenantId, method, status]);
  const confirmed = filtered.filter((payment) => payment.status === "confirmed");
  const receivedXaf = confirmed.reduce((sum, payment) => sum + payment.amountXaf, 0);
  const creditXaf = confirmed.reduce((sum, payment) => sum + payment.creditCreatedXaf, 0);

  return <div className="page-stack payments-page-v2">
    <PageHeader eyebrow={t("Cycle financier", "Financial cycle")} title={t("Paiements", "Payments")} description={t("Encaissements réels, allocations et corrections traçables de l’Organization active.", "Real receipts, allocations and traceable corrections for the active Organization.")} action={canRecord ? <Link className="button button--accent" href="/app/paiements/nouveau"><Plus size={17} />{t("Nouveau paiement", "New payment")}</Link> : undefined} />
    <div className="payment-kpi-grid">
      <FinancialStateCard icon={CircleDollarSign} label={t("Reçu dans la sélection", "Received in selection")} value={money(receivedXaf)} helper={t(`${confirmed.length} paiement(s) confirmé(s)`, `${confirmed.length} confirmed payment(s)`)} tone="positive" />
      <FinancialStateCard icon={WalletCards} label={t("Crédit créé", "Credit created")} value={money(creditXaf)} helper={t("Reliquat non alloué au moment de l’encaissement.", "Amount left unallocated at confirmation.")} tone="info" />
    </div>
    <Card className="payment-filter-card">
      <label className="demo-search"><Search size={18} /><span className="sr-only">{t("Rechercher", "Search")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Référence, locataire ou logement", "Reference, tenant or unit")} /></label>
      <div className="payment-filters">
        <label className="field"><span>{t("Période", "Period")}</span><input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
        <label className="field"><span>{t("Locataire", "Tenant")}</span><select value={tenantId} onChange={(event) => setTenantId(event.target.value)}><option value="all">{t("Tous", "All")}</option>{tenants.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="field"><span>{t("Moyen", "Method")}</span><select value={method} onChange={(event) => setMethod(event.target.value)}><option value="all">{t("Tous", "All")}</option>{PAYMENT_METHODS.map((value) => <option key={value} value={value}>{methodLabel(value, t)}</option>)}</select></label>
        <label className="field"><span>{t("Statut", "Status")}</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">{t("Tous", "All")}</option><option value="confirmed">{t("Confirmé", "Confirmed")}</option><option value="reversed">{t("Annulé", "Reversed")}</option></select></label>
      </div>
    </Card>
    {filtered.length ? <Card className="payment-table-card"><div className="payment-table" role="table">
      <div className="payment-table__head" role="row"><span>{t("Date", "Date")}</span><span>{t("Locataire / logement", "Tenant / unit")}</span><span>{t("Montant", "Amount")}</span><span>{t("Moyen", "Method")}</span><span>{t("Allocation", "Allocation")}</span><span>{t("Statut", "Status")}</span></div>
      {filtered.map((payment) => <Link className="payment-table__row" href={`/app/paiements/${payment.id}`} key={payment.id} role="row">
        <span data-label={t("Date", "Date")}><strong>{shortDate(payment.paymentDate)}</strong><small>{payment.reference}</small></span>
        <span data-label={t("Locataire / logement", "Tenant / unit")}><strong>{payment.tenantName}</strong><small>{payment.propertyName} · {payment.unitLabel}</small></span>
        <span data-label={t("Montant", "Amount")} className="financial-value">{money(payment.amountXaf)}</span>
        <span data-label={t("Moyen", "Method")}>{paymentMethodIcon(payment.method)}{methodLabel(payment.method, t)}<small>{payment.externalReference ?? "—"}</small></span>
        <span data-label={t("Allocation", "Allocation")}><strong>{money(payment.allocatedXaf)}</strong>{payment.creditCreatedXaf > 0 ? <small>{t(`Crédit ${money(payment.creditCreatedXaf)}`, `Credit ${money(payment.creditCreatedXaf)}`)}</small> : null}</span>
        <span data-label={t("Statut", "Status")}>{paymentStatus(payment, t)}</span>
      </Link>)}
    </div></Card> : <Card><EmptyState icon={WalletCards} title={payments.length ? t("Aucun résultat", "No results") : t("Aucun paiement réel", "No real payments")} description={payments.length ? t("Modifiez les filtres.", "Change the filters.") : t("Le premier encaissement apparaîtra ici après confirmation.", "The first receipt will appear here after confirmation.")} action={canRecord && !payments.length ? <Link className="button button--primary" href="/app/paiements/nouveau">{t("Enregistrer un paiement", "Record a payment")}</Link> : undefined} /></Card>}
  </div>;
}

export function NewPaymentView({ options, initialLeaseId, initialAmountXaf = 0, initialAllocation = false }: { options: PaymentLeaseOption[]; initialLeaseId?: string; initialAmountXaf?: number; initialAllocation?: boolean }) {
  const t = useCopy(); const router = useRouter();
  const initial = options.some((option) => option.leaseId === initialLeaseId) ? initialLeaseId! : options.find((option) => option.status === "active")?.leaseId ?? options[0]?.leaseId ?? "";
  const [step, setStep] = useState(1); const [leaseId, setLeaseId] = useState(initial);
  const [amount, setAmount] = useState(initialAmountXaf > 0 ? String(initialAmountXaf) : ""); const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>("cash"); const [externalReference, setExternalReference] = useState(""); const [note, setNote] = useState("");
  const [allocations, setAllocations] = useState<PaymentAllocationInput[]>([]); const [allocationEdited, setAllocationEdited] = useState(false);
  const [idempotencyKey] = useState(() => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const selected = options.find((option) => option.leaseId === leaseId) ?? null;
  const amountXaf = Number(amount);
  const reconciliation = reconcilePaymentAllocation(amountXaf, allocations);
  const allocationMap = new Map(allocations.map((allocation) => [allocation.dueId, allocation.amountXaf]));

  function prepareAllocation() {
    if (!selected || !Number.isSafeInteger(amountXaf) || amountXaf <= 0) return;
    const proposal = initialAllocation ? proposeInitialPaymentAllocations(selected.dues, amountXaf, paymentDate) : proposePaymentAllocations(selected.dues, amountXaf, paymentDate);
    setAllocations(proposal.allocations); setAllocationEdited(false); setStep(3);
  }
  function setAllocation(dueId: string, value: number) {
    const next = allocations.filter((allocation) => allocation.dueId !== dueId);
    if (Number.isSafeInteger(value) && value > 0) next.push({ dueId, amountXaf: value });
    setAllocations(next); setAllocationEdited(true);
  }
  async function confirm(event: FormEvent) {
    event.preventDefault(); if (!selected || !reconciliation.reconciles) return;
    setBusy(true); setMessage(null);
    const result = await mutate({
      action: "confirm", leaseId, amountXaf, paymentDate, method, externalReference, note,
      idempotencyKey, allocations: allocationEdited ? allocations : null,
    });
    setBusy(false);
    if (!result.ok || typeof result.body.paymentId !== "string") return setMessage(friendlyError(result.body.error as string | undefined, t));
    router.push(`/app/paiements/${result.body.paymentId}?success=1`); router.refresh();
  }

  if (!options.length) return <div className="page-stack"><Link className="demo-back" href="/app/paiements"><ArrowLeft size={17} />{t("Paiements", "Payments")}</Link><Card><EmptyState icon={WalletCards} title={t("Aucune Location disponible", "No available lease")} description={t("Activez d’abord une Location et ses échéances.", "Activate a lease and its dues first.")} /></Card></div>;
  return <div className="page-stack payment-flow-v2">
    <Link className="demo-back" href="/app/paiements"><ArrowLeft size={17} />{t("Tous les paiements", "All payments")}</Link>
    <PageHeader eyebrow={t("Paiements", "Payments")} title={initialAllocation ? t("Répartir le montant reçu", "Allocate received amount") : t("Enregistrer un paiement", "Record a payment")} description={t("Saisie, allocation, résumé puis confirmation atomique.", "Entry, allocation, summary and atomic confirmation.")} />
    <ol className="payment-steps" aria-label={t("Étapes", "Steps")}>{[t("Location", "Lease"), t("Paiement", "Payment"), t("Allocation", "Allocation"), t("Confirmation", "Confirmation")].map((label, index) => <li className={step === index + 1 ? "is-active" : step > index + 1 ? "is-complete" : ""} key={label}><span>{index + 1}</span>{label}</li>)}</ol>

    {step === 1 ? <Card className="payment-step-card"><div className="section-heading"><div><p className="eyebrow">1 / 4</p><h2>{t("Locataire et Location", "Tenant and lease")}</h2></div><UserRound size={22} /></div><label className="field"><span>{t("Location", "Lease")}</span><select value={leaseId} onChange={(event) => setLeaseId(event.target.value)}>{options.map((option) => <option key={option.leaseId} value={option.leaseId}>{option.tenantName} · {option.propertyName} · {option.unitLabel}{option.status === "ended" ? ` · ${t("terminée", "ended")}` : ""}</option>)}</select></label>{selected ? <div className="payment-context-grid"><FinancialStateCard icon={CircleDollarSign} label={t("Solde dû", "Amount due")} value={money(selected.amountDueXaf)} helper={t("Après crédits déjà disponibles.", "After currently available credits.")} tone={selected.amountDueXaf > 0 ? "danger" : "positive"} /><FinancialStateCard icon={WalletCards} label={t("Crédit disponible", "Available credit")} value={money(selected.availableCreditXaf)} helper={t(`${selected.dues.length} échéance(s) encore ouverte(s)`, `${selected.dues.length} open due(s)`)} tone="positive" /></div> : null}<button className="button button--primary" disabled={!selected} onClick={() => setStep(2)} type="button">{t("Continuer", "Continue")}</button></Card> : null}

    {step === 2 && selected ? <Card className="payment-step-card"><div className="section-heading"><div><p className="eyebrow">2 / 4</p><h2>{t("Paiement reçu", "Payment received")}</h2></div><CreditCard size={22} /></div><div className="payment-form-grid"><label className="field"><span>{t("Montant reçu (XAF)", "Amount received (XAF)")}</span><input inputMode="numeric" min="1" step="1" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label className="field"><span>{t("Date réelle de réception", "Actual receipt date")}</span><input max={new Date().toISOString().slice(0, 10)} type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label><label className="field"><span>{t("Moyen de paiement", "Payment method")}</span><select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((value) => <option key={value} value={value}>{methodLabel(value, t)}</option>)}</select></label><label className="field"><span>{t("Référence externe (facultative)", "External reference (optional)")}</span><input maxLength={160} value={externalReference} onChange={(event) => setExternalReference(event.target.value)} placeholder={method === "cash" ? t("Facultative pour les espèces", "Optional for cash") : t("Référence de transaction recommandée", "Transaction reference recommended")} /></label><label className="field payment-note-field"><span>{t("Note (facultative)", "Note (optional)")}</span><textarea maxLength={2000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></label></div>{selected.amountDueXaf > 0 ? <button className="button button--secondary payment-quick-amount" onClick={() => setAmount(String(selected.amountDueXaf))} type="button">{t(`Régler ${money(selected.amountDueXaf)}`, `Pay ${money(selected.amountDueXaf)}`)}</button> : null}<div className="demo-form-actions"><button className="button button--secondary" onClick={() => setStep(1)} type="button">{t("Retour", "Back")}</button><button className="button button--primary" disabled={!Number.isSafeInteger(amountXaf) || amountXaf <= 0 || !paymentDate} onClick={prepareAllocation} type="button">{t("Proposer l’allocation", "Propose allocation")}</button></div></Card> : null}

    {step === 3 && selected ? <Card className="payment-step-card"><div className="section-heading"><div><p className="eyebrow">3 / 4</p><h2>{t("Allocation proposée", "Proposed allocation")}</h2></div><FileClock size={22} /></div><p>{t("Par défaut, KJORA couvre la plus ancienne dette exigible. Les échéances futures et le dépôt restent un choix explicite.", "By default, KJORA covers the oldest due debt. Future dues and the deposit remain an explicit choice.")}</p><div className="allocation-list">{selected.dues.map((due) => { const value = allocationMap.get(due.id) ?? 0; return <label className="allocation-row" key={due.id}><span><strong>{dueLabel(due, t)}</strong><small>{due.reference} · {t("limite", "due")} {shortDate(due.dueDate)} · {t("reste", "remaining")} {money(due.remainingXaf)}</small><small>{due.kind === "deposit" ? t("Dépôt séparé — allocation explicite uniquement", "Separate deposit — explicit allocation only") : `${money(due.rentXaf)} ${t("loyer", "rent")} + ${money(due.recurringChargesXaf)} ${t("charges", "charges")}`}</small></span><input aria-label={t(`Allocation ${due.reference}`, `Allocation ${due.reference}`)} inputMode="numeric" max={due.remainingXaf} min="0" step="1" type="number" value={value || ""} onChange={(event) => setAllocation(due.id, Number(event.target.value))} /></label>; })}</div><div className="payment-reconciliation"><span><small>{t("Montant reçu", "Amount received")}</small><strong>{money(amountXaf)}</strong></span><span><small>{t("Montant alloué", "Allocated amount")}</small><strong>{money(reconciliation.allocatedXaf)}</strong></span><span><small>{t("Crédit créé", "Credit created")}</small><strong>{money(reconciliation.creditCreatedXaf)}</strong></span></div>{!reconciliation.reconciles ? <p className="form-feedback form-feedback--error" role="alert">{t("Le total alloué dépasse le montant reçu.", "The allocated total exceeds the amount received.")}</p> : null}<div className="demo-form-actions"><button className="button button--secondary" onClick={() => setStep(2)} type="button">{t("Retour", "Back")}</button><button className="button button--primary" disabled={!reconciliation.reconciles} onClick={() => setStep(4)} type="button">{t("Voir le résumé", "Review summary")}</button></div></Card> : null}

    {step === 4 && selected ? <form onSubmit={confirm}><Card className="payment-step-card payment-confirmation-card"><div className="section-heading"><div><p className="eyebrow">4 / 4</p><h2>{t("Confirmer l’encaissement", "Confirm receipt")}</h2></div><CheckCircle2 size={22} /></div><div className="payment-confirmation-amount"><small>{t("Montant reçu", "Amount received")}</small><strong className="financial-value">{money(amountXaf)}</strong><span>{methodLabel(method, t)} · {shortDate(paymentDate)}</span></div><dl className="payment-confirmation-facts"><div><dt>{t("Locataire", "Tenant")}</dt><dd>{selected.tenantName}</dd></div><div><dt>{t("Location", "Lease")}</dt><dd>{selected.propertyName} · {selected.unitLabel}</dd></div><div><dt>{t("Montant alloué", "Allocated amount")}</dt><dd>{money(reconciliation.allocatedXaf)}</dd></div><div><dt>{t("Crédit créé", "Credit created")}</dt><dd>{money(reconciliation.creditCreatedXaf)}</dd></div><div><dt>{t("Solde exigible estimé", "Estimated due balance")}</dt><dd>{money(Math.max(selected.amountDueXaf - allocations.reduce((sum, allocation) => { const due = selected.dues.find((item) => item.id === allocation.dueId); return sum + (due && due.dueDate <= paymentDate ? allocation.amountXaf : 0); }, 0), 0))}</dd></div><div><dt>{t("Crédit de cette réception", "Credit from this receipt")}</dt><dd>{money(reconciliation.creditCreatedXaf)}</dd></div></dl><div className="allocation-summary">{allocations.map((allocation) => { const due = selected.dues.find((item) => item.id === allocation.dueId); return due ? <div key={allocation.dueId}><span>{dueLabel(due, t)}</span><strong>{money(allocation.amountXaf)}</strong></div> : null; })}{reconciliation.creditCreatedXaf > 0 ? <div><span>{t("Reliquat vers crédit", "Remainder to credit")}</span><strong>{money(reconciliation.creditCreatedXaf)}</strong></div> : null}</div>{message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}<div className="demo-form-actions"><button className="button button--secondary" disabled={busy} onClick={() => setStep(3)} type="button">{t("Retour", "Back")}</button><button className="button button--accent" disabled={busy || !reconciliation.reconciles} type="submit">{busy ? t("Confirmation…", "Confirming…") : t("Confirmer l’encaissement", "Confirm receipt")}</button></div></Card></form> : null}
  </div>;
}

function balanceLabel(value: number, t: ReturnType<typeof useCopy>) {
  if (value > 0) return t(`Crédit ${money(value)}`, `Credit ${money(value)}`);
  if (value < 0) return t(`Dû ${money(Math.abs(value))}`, `Due ${money(Math.abs(value))}`);
  return t("À jour · 0 XAF", "Current · 0 XAF");
}

export function PaymentDetailView({ payment, canCorrect, currentUserId, success, documents, canPrepareReceipt, canShare, emailDeliveryEnabled }: { payment: PaymentDetail; canCorrect: boolean; currentUserId: string; success: boolean; documents: FinancialDocumentSummary[]; canPrepareReceipt: boolean; canShare: boolean; emailDeliveryEnabled: boolean }) {
  const t = useCopy(); const router = useRouter(); const [reversing, setReversing] = useState(false); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const paymentReceipt = documents.find((document) => document.type === "payment_receipt") ?? null;
  async function prepareReceipt() {
    setBusy(true); setMessage(null);
    const result = await fetch("/api/financial-documents", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "prepare_payment_receipt", paymentId: payment.id }),
    });
    const body = await result.json().catch(() => ({})) as Record<string, unknown>;
    setBusy(false);
    if (!result.ok || typeof body.documentId !== "string") {
      setMessage(t("Le reçu n’a pas pu être préparé. Vérifiez l’état du paiement puis réessayez.", "The receipt could not be prepared. Check the payment status and try again."));
      return;
    }
    window.open(`/api/financial-documents/${body.documentId}/download`, "_blank", "noopener,noreferrer");
    router.refresh();
  }
  async function reverse() { setBusy(true); setMessage(null); const result = await mutate({ action: "reverse", paymentId: payment.id, reason }); setBusy(false); if (!result.ok) return setMessage(friendlyError(result.body.error as string | undefined, t)); setReversing(false); router.refresh(); }
  return <div className="page-stack payment-detail-v2"><Link className="demo-back" href="/app/paiements"><ArrowLeft size={17} />{t("Tous les paiements", "All payments")}</Link>{success ? <p className="payment-success-banner" role="status"><CheckCircle2 size={18} />{t("Paiement enregistré et soldes recalculés.", "Payment recorded and balances recalculated.")}</p> : null}<section className="payment-hero"><div><p className="eyebrow">{payment.reference}</p><h1>{money(payment.amountXaf)}</h1><p>{payment.tenantName} · {payment.propertyName} · {payment.unitLabel}</p></div><div className="payment-hero__method">{paymentMethodIcon(payment.method, 22)}<span>{methodLabel(payment.method, t)}</span><strong>{shortDate(payment.paymentDate)}</strong></div>{paymentStatus(payment, t)}</section>
    <div className="payment-detail-grid"><Card className="payment-allocation-card"><div className="section-heading"><div><p className="eyebrow">PaymentAllocation</p><h2>{t("Répartition confirmée", "Confirmed allocation")}</h2></div><FileClock size={21} /></div>{payment.allocations.length ? <div className="allocation-summary">{payment.allocations.map((allocation) => <div key={allocation.id}><span><strong>{allocation.dueKind === "deposit" ? t("Dépôt de garantie", "Security deposit") : `${shortDate(allocation.periodStart)} → ${shortDate(allocation.periodEnd)}`}</strong><small>{allocation.dueReference} · {money(allocation.rentXaf)} {t("loyer", "rent")} + {money(allocation.recurringChargesXaf)} {t("charges", "charges")}{allocation.depositXaf ? ` · ${money(allocation.depositXaf)} ${t("dépôt", "deposit")}` : ""}</small></span><strong>{money(allocation.amountXaf)}</strong></div>)}</div> : <p>{t("Aucune échéance allouée : le montant a créé un crédit.", "No due was allocated: the amount created credit.")}</p>}<div className="payment-reconciliation"><span><small>{t("Reçu", "Received")}</small><strong>{money(payment.amountXaf)}</strong></span><span><small>{t("Alloué", "Allocated")}</small><strong>{money(payment.allocatedXaf)}</strong></span><span><small>{t("Crédit créé", "Credit created")}</small><strong>{money(payment.creditCreatedXaf)}</strong></span></div></Card>
      <Card className="payment-facts-card"><div className="section-heading"><div><p className="eyebrow">Payment</p><h2>{t("Informations", "Information")}</h2></div><CreditCard size={21} /></div><dl className="record-detail-list"><div><dt>{t("Référence interne", "Internal reference")}</dt><dd>{payment.reference}</dd></div><div><dt>{t("Référence externe", "External reference")}</dt><dd>{payment.externalReference ?? "—"}</dd></div><div><dt>{t("Moyen", "Method")}</dt><dd>{methodLabel(payment.method, t)}</dd></div><div><dt>{t("Enregistré par", "Recorded by")}</dt><dd>{payment.createdBy === currentUserId ? t("Vous", "You") : t("Membre autorisé", "Authorized team member")}</dd></div><div><dt>{t("Créé le", "Created on")}</dt><dd>{shortDate(payment.createdAt)}</dd></div><div><dt>{t("Allocation", "Allocation")}</dt><dd>{payment.allocationMode === "automatic" ? t("Automatique · plus ancienne dette exigible", "Automatic · oldest due debt") : t("Manuelle confirmée", "Confirmed manually")}</dd></div>{payment.note ? <div><dt>{t("Note", "Note")}</dt><dd>{payment.note}</dd></div> : null}</dl></Card>
    </div>
    <Card className="payment-impact-card"><div className="section-heading"><div><p className="eyebrow">Ledger</p><h2>{t("Impact au moment de l’encaissement", "Impact at confirmation")}</h2></div><CalendarDays size={21} /></div><div className="payment-impact-values"><span><small>{t("Avant", "Before")}</small><strong>{balanceLabel(payment.balanceBeforeXaf, t)}</strong></span><span><small>{t("Après réception", "After receipt")}</small><strong>{balanceLabel(payment.balanceAfterXaf, t)}</strong></span></div><Link className="button button--secondary" href={`/app/locataires/${payment.tenantId}/etat-de-compte`}>{t("Voir l’état de compte", "View statement")}</Link></Card>
    {payment.status === "reversed" ? <Card className="payment-reversal-card"><div className="section-heading"><div><p className="eyebrow">PAYMENT_REVERSED</p><h2>{t("Paiement annulé par compensation", "Payment reversed by compensation")}</h2></div><RotateCcw size={21} /></div><p>{payment.reversalReason}</p><small>{t("L’original et ses allocations sont conservés ; une ligne Ledger inverse restaure les soldes.", "The original and its allocations are preserved; an inverse Ledger line restores balances.")}</small></Card> : null}
    <div className="payment-receipt-action">
      <div><ReceiptText size={22} /><span><strong>{t("Reçu de paiement", "Payment receipt")}</strong><small>{t("Il certifie uniquement l’argent réellement reçu, même pour un paiement partiel.", "It certifies only the money actually received, including a partial payment.")}</small></span></div>
      {paymentReceipt ? <Link className="button button--accent" href={`/api/financial-documents/${paymentReceipt.id}/download`} prefetch={false} target="_blank"><Download size={16} />{t("Télécharger le reçu", "Download receipt")}</Link>
        : canPrepareReceipt && payment.status === "confirmed" ? <button className="button button--accent" disabled={busy} onClick={prepareReceipt} type="button"><ReceiptText size={16} />{busy ? t("Préparation…", "Preparing…") : t("Générer le reçu", "Generate receipt")}</button> : null}
    </div>
    <FinancialDocumentsPanel canShare={canShare} documents={documents} emailDeliveryEnabled={emailDeliveryEnabled} />
    <div className="payment-detail-actions">{message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}{canCorrect && payment.status === "confirmed" ? <button className="button button--danger" onClick={() => setReversing(true)} type="button"><RotateCcw size={17} />{t("Annuler ce paiement", "Reverse this payment")}</button> : null}</div>
    {reversing ? <div className="confirmation-modal" role="presentation"><button aria-label={t("Fermer", "Close")} className="confirmation-modal__backdrop" onClick={() => setReversing(false)} type="button" /><section aria-modal="true" className="confirmation-modal__panel" role="dialog"><div className="confirmation-modal__header"><div><p className="eyebrow">{t("Correction financière", "Financial correction")}</p><h2>{t("Annuler par compensation", "Reverse by compensation")}</h2></div></div><p>{t("Le paiement original ne sera jamais supprimé. Ses allocations cesseront d’agir et une écriture inverse sera ajoutée au Ledger.", "The original payment will never be deleted. Its allocations will stop applying and an inverse entry will be appended to the Ledger.")}</p><label className="field"><span>{t("Motif obligatoire", "Required reason")}</span><textarea minLength={3} maxLength={500} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} /></label>{message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}<div className="demo-form-actions"><button className="button button--secondary" disabled={busy} onClick={() => setReversing(false)} type="button">{t("Conserver le paiement", "Keep payment")}</button><button className="button button--danger" disabled={busy || reason.trim().length < 3} onClick={reverse} type="button">{busy ? t("Annulation…", "Reversing…") : t("Confirmer l’annulation", "Confirm reversal")}</button></div></section></div> : null}
  </div>;
}

export function PaymentHistoryPanel({ payments, documents = [], canRecord, leaseId }: { payments: PaymentSummary[]; documents?: FinancialDocumentSummary[]; canRecord: boolean; leaseId?: string }) {
  const t = useCopy();
  const receipts = new Map(documents.filter((document) => document.type === "payment_receipt" && document.paymentId).map((document) => [document.paymentId!, document]));
  return <Card className="payment-history-card" id="paiements"><div className="section-heading"><div><p className="eyebrow">{t("Paiements", "Payments")}</p><h2>{t("Paiements réels", "Real payments")}</h2></div>{canRecord ? <Link className="button button--secondary" href={`/app/paiements/nouveau${leaseId ? `?lease=${leaseId}` : ""}`}><Plus size={16} />{t("Enregistrer", "Record")}</Link> : <WalletCards size={21} />}</div>{payments.length ? <div className="demo-list">{payments.slice(0, 8).map((payment) => { const receipt = receipts.get(payment.id); return <div className="demo-list-row payment-history-row" key={payment.id}><span className="demo-list-row__icon"><CreditCard size={18} /></span><div><strong>{money(payment.amountXaf)} · {methodLabel(payment.method, t)}</strong><span>{shortDate(payment.paymentDate)} · {payment.reference}</span><small>{payment.allocatedXaf ? t(`${money(payment.allocatedXaf)} de Payments réels alloués`, `${money(payment.allocatedXaf)} in real Payments allocated`) : t(`${money(payment.creditCreatedXaf)} vers le crédit`, `${money(payment.creditCreatedXaf)} to credit`)}</small></div>{paymentStatus(payment, t)}<div className="payment-history-row__actions"><Link className="button button--secondary" href={`/app/paiements/${payment.id}`}>{t("Voir le paiement", "View payment")}</Link>{receipt ? <Link className="button button--secondary" href={`/api/financial-documents/${receipt.id}/download`} prefetch={false} target="_blank"><ReceiptText size={15} />{t("Reçu", "Receipt")}</Link> : payment.status === "confirmed" ? <Link className="button button--secondary" href={`/app/paiements/${payment.id}#documents`}><ReceiptText size={15} />{t("Reçu", "Receipt")}</Link> : null}</div></div>; })}</div> : <EmptyState icon={WalletCards} title={t("Aucun paiement", "No payments")} description={t("Aucun argent reçu n’a encore été enregistré pour ce contexte.", "No received money has been recorded for this context yet.")} />}</Card>;
}
