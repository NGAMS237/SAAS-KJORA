"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { CalendarClock, Search } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/ui";
import { formatXaf, normalizeTenantPhone } from "@/modules/communications/message-templates";
import { DuesDrawer, type DrawerState } from "./dues-drawers";
import { paymentDrawerHref } from "./reminder";
import type { DueStatus } from "./model";
import { DUE_FILTERS, attachBalances, countByFilter, daysLate, groupByMonth, matchesFilter, matchesSearch, sortRows, summarize, summarizeByTenant, type DueFilter, type DueOverviewRow, type DueOverviewRowWithBalance, type TenantSituation } from "./overview";

const FILTER_LABELS: Record<DueFilter, string> = { all: "Toutes", overdue: "En retard", due: "À régler", upcoming: "À venir", settled: "Réglées" };
const STATUS: Record<DueStatus, [string, "neutral" | "success" | "warning" | "danger" | "info" | "due"]> = {
  upcoming: ["À venir", "info"], due: ["À régler", "due"], overdue: ["En retard", "danger"], covered: ["Couverte par crédit", "success"],
  partially_paid: ["Partiel", "warning"], paid: ["Réglée", "success"], cancelled: ["Annulée", "neutral"], adjusted: ["Ajustée", "neutral"],
};

function shortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function tone(row: DueOverviewRow) {
  if (row.status === "overdue") return "overdue";
  if (row.status === "partially_paid") return "partial";
  if (row.status === "due") return "due";
  if (row.status === "paid" || row.status === "covered" || row.status === "cancelled") return "settled";
  return "upcoming";
}

type OpenDrawer = (state: DrawerState) => void;

// Lien « normal » (clic droit, Ctrl/Cmd+clic, ouverture dans un nouvel onglet : tout fonctionne) qui,
// sur un simple clic, ouvre le tiroir au lieu de quitter la page.
function DrawerLink({ href, state, open, children }: { href: string; state: DrawerState; open: OpenDrawer; children: ReactNode }) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
    open(state);
  }
  return <a href={href} onClick={onClick}>{children}</a>;
}

function pageState(title: string, subtitle: string, href: string): DrawerState {
  return { type: "page", title, subtitle, href };
}

function ReminderButton({ label, state, open }: { label: string; state: DrawerState; open: OpenDrawer }) {
  return <button onClick={(event) => { (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); open(state); }} type="button">{label}</button>;
}

function RowMenu({ row, canRecord, canManage, today, open, civility, totalDue }: { row: DueOverviewRow; canRecord: boolean; canManage: boolean; today: string; open: OpenDrawer; civility: "M." | "Mme" | null; totalDue: number }) {
  const canPay = row.remainingXaf > 0 && row.status !== "cancelled";
  const phone = normalizeTenantPhone(row.phone);
  const who = `${row.tenantName} · ${row.unitLabel}`;
  void today;
  const payHref = paymentDrawerHref(row.leaseId, row.remainingXaf);
  return (
    <details className="row-menu">
      <summary aria-label={`Actions pour ${row.tenantName}`}>⋯</summary>
      <div className="row-menu__panel">
        {canRecord && canPay ? <DrawerLink href={payHref} open={open} state={pageState("Enregistrer un paiement", who, payHref)}>Enregistrer un paiement</DrawerLink> : null}
        {canPay ? <ReminderButton label={row.status === "overdue" ? "Relancer (WhatsApp, e-mail)" : "Rappeler (WhatsApp, e-mail)"} open={open} state={{ type: "reminder", title: row.status === "overdue" ? "Relancer le locataire" : "Rappeler le locataire", subtitle: who, target: { tenantName: row.tenantName, civility, unitLabel: row.unitLabel, phone: row.phone, email: row.email, status: row.status, dueDate: row.dueDate, totalDueXaf: totalDue, rowRemainingXaf: row.remainingXaf, rowTotalXaf: row.totalXaf } }} /> : null}
        <DrawerLink href={`/app/locations/${row.leaseId}#documents`} open={open} state={pageState("Avis, reçus et quittances", who, `/app/locations/${row.leaseId}#documents`)}>Avis, reçus et quittances</DrawerLink>
        <DrawerLink href={`/app/locataires/${row.tenantId}/etat-de-compte`} open={open} state={pageState("État de compte", who, `/app/locataires/${row.tenantId}/etat-de-compte`)}>État de compte</DrawerLink>
        <DrawerLink href={`/app/locataires/${row.tenantId}`} open={open} state={pageState("Fiche du locataire", who, `/app/locataires/${row.tenantId}`)}>Voir le locataire</DrawerLink>
        <DrawerLink href={`/app/locations/${row.leaseId}`} open={open} state={pageState("Bail", who, `/app/locations/${row.leaseId}`)}>Voir le bail</DrawerLink>
        {canManage ? <DrawerLink href={`/app/locations/${row.leaseId}#changer-loyer`} open={open} state={pageState("Modifier le loyer", who, `/app/locations/${row.leaseId}#changer-loyer`)}>Modifier le loyer</DrawerLink> : null}
        {canPay && !phone && !row.email ? <small>Ni numéro WhatsApp ni e-mail connus : le message pourra être copié.</small> : null}
      </div>
    </details>
  );
}

function TenantMenu({ item, canRecord, canManage, open, civility }: { item: TenantSituation; canRecord: boolean; canManage: boolean; open: OpenDrawer; civility: "M." | "Mme" | null }) {
  const owes = item.debtXaf > 0;
  const who = `${item.tenantName} · ${item.unitLabel}`;
  const payHref = paymentDrawerHref(item.leaseId, item.debtXaf);
  return (
    <details className="row-menu">
      <summary aria-label={`Actions pour ${item.tenantName}`}>⋯</summary>
      <div className="row-menu__panel">
        {canRecord && owes ? <DrawerLink href={payHref} open={open} state={pageState("Enregistrer un paiement", who, payHref)}>Enregistrer un paiement</DrawerLink> : null}
        {owes ? <ReminderButton label="Relancer (WhatsApp, e-mail)" open={open} state={{ type: "reminder", title: "Relancer le locataire", subtitle: who, target: { tenantName: item.tenantName, civility, unitLabel: item.unitLabel, phone: item.phone, email: item.email, status: item.overdueCount > 0 ? "overdue" : "due", dueDate: item.nextDue ?? item.oldestOverdue ?? "2000-01-01", totalDueXaf: item.debtXaf, rowRemainingXaf: item.debtXaf, rowTotalXaf: item.monthlyXaf } }} /> : null}
        <Link href={`/app/echeances?tenant=${item.tenantId}`}>Voir ses échéances</Link>
        <DrawerLink href={`/app/locataires/${item.tenantId}/etat-de-compte`} open={open} state={pageState("État de compte", who, `/app/locataires/${item.tenantId}/etat-de-compte`)}>État de compte</DrawerLink>
        <DrawerLink href={`/app/locataires/${item.tenantId}`} open={open} state={pageState("Fiche du locataire", who, `/app/locataires/${item.tenantId}`)}>Voir le locataire</DrawerLink>
        <DrawerLink href={`/app/locations/${item.leaseId}`} open={open} state={pageState("Bail", who, `/app/locations/${item.leaseId}`)}>Voir le bail</DrawerLink>
        {canManage ? <DrawerLink href={`/app/locations/${item.leaseId}#changer-loyer`} open={open} state={pageState("Modifier le loyer", who, `/app/locations/${item.leaseId}#changer-loyer`)}>Modifier le loyer</DrawerLink> : null}
      </div>
    </details>
  );
}

const PAGE_SIZES = [30, 50, 100];

export function DuesOverviewView({ rows: baseRows, amountsDue, civilities = {}, canRecord, canManage, scopeLabel, today }: { rows: DueOverviewRow[]; amountsDue: Record<string, number>; civilities?: Record<string, "M." | "Mme" | null>; canRecord: boolean; canManage: boolean; scopeLabel: string | null; today: string }) {
  const router = useRouter();
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [drawerKey, setDrawerKey] = useState(0);
  const openDrawer = useCallback((state: DrawerState) => { setDrawerKey((key) => key + 1); setDrawer(state); }, []);
  const closeDrawer = useCallback((changed: boolean) => { setDrawer(null); if (changed) router.refresh(); }, [router]);
  const [filter, setFilter] = useState<DueFilter>("all");
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("all");
  const [property, setProperty] = useState("all");
  const [mode, setMode] = useState<"echeances" | "locataires">("echeances");
  const [limit, setLimit] = useState(30);
  const rows = useMemo<DueOverviewRowWithBalance[]>(() => attachBalances(baseRows, amountsDue, today), [baseRows, amountsDue, today]);
  const properties = useMemo(() => [...new Set(baseRows.map((row) => row.propertyName))].sort(), [baseRows]);
  const counts = useMemo(() => countByFilter(rows), [rows]);
  const months = useMemo(() => groupByMonth(rows).map((group) => ({ key: group.key, label: group.label })), [rows]);
  const visible = useMemo(() => rows.filter((row) => matchesFilter(row, filter) && matchesSearch(row, query) && (month === "all" || row.dueDate.startsWith(month)) && (property === "all" || row.propertyName === property)), [rows, filter, query, month, property]);
  const totals = useMemo(() => summarize(visible), [visible]);
  const limited = useMemo(() => sortRows(visible).slice(0, limit), [visible, limit]);
  const groups = useMemo(() => groupByMonth(limited).map((group) => ({ ...group, rows: sortRows(group.rows) })), [limited]);
  const situations = useMemo(() => summarizeByTenant(visible, amountsDue, today).filter((item) => filter === "overdue" ? item.overdueCount > 0 : filter === "due" ? item.debtXaf > 0 : true), [visible, amountsDue, today, filter]);

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Finances" title="Échéances" description="Toutes les échéances en un seul tableau. Le menu ⋯ de chaque ligne donne les actions : paiement, relance, documents." action={canRecord ? <Link className="button button--primary" href="/app/paiements/nouveau" onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return; event.preventDefault(); openDrawer({ type: "page", title: "Enregistrer un paiement", href: "/app/paiements/nouveau" }); }}>Enregistrer un paiement</Link> : undefined} />
      {scopeLabel ? <Card muted><p>Filtré sur : <strong>{scopeLabel}</strong>. <Link href="/app/echeances">Voir toutes les échéances</Link></p></Card> : null}
      <div className="dues-totals">
        <div><small>Attendu</small><strong>{formatXaf(totals.expectedXaf)}</strong></div>
        <div><small>Encaissé</small><strong>{formatXaf(totals.receivedXaf)}</strong></div>
        <div><small>Reste dû</small><strong>{formatXaf(totals.remainingXaf)}</strong></div>
        <div className={totals.overdueCount ? "dues-totals__alert" : ""}><small>En retard</small><strong>{formatXaf(totals.overdueXaf)}</strong><span>{totals.overdueCount} échéance(s)</span></div>
      </div>
      <Card>
        <div className="dues-modes" role="tablist" aria-label="Affichage">
          <button aria-selected={mode === "echeances"} className={`dues-filter${mode === "echeances" ? " is-active" : ""}`} onClick={() => setMode("echeances")} role="tab" type="button">Par échéance</button>
          <button aria-selected={mode === "locataires"} className={`dues-filter${mode === "locataires" ? " is-active" : ""}`} onClick={() => setMode("locataires")} role="tab" type="button">Par locataire</button>
        </div>
        <div className="dues-toolbar">
          <div className="dues-filters" role="tablist" aria-label="Filtrer les échéances">
            {DUE_FILTERS.map((item) => <button aria-selected={filter === item} className={`dues-filter${filter === item ? " is-active" : ""}`} key={item} onClick={() => setFilter(item)} role="tab" type="button">{FILTER_LABELS[item]} <span>{counts[item]}</span></button>)}
          </div>
          <label className="dues-search"><Search aria-hidden="true" size={15} /><input aria-label="Rechercher" onChange={(event) => setQuery(event.target.value)} placeholder="Locataire, logement…" value={query} /></label>
          <select aria-label="Bien" onChange={(event) => setProperty(event.target.value)} value={property}>
            <option value="all">Tous les biens</option>
            {properties.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select aria-label="Mois" onChange={(event) => setMonth(event.target.value)} value={month}>
            <option value="all">Tous les mois</option>
            {months.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </div>
        {mode === "locataires" ? (
          situations.length ? (
            <div className="table-scroll">
              <table className="dues-table">
                <thead><tr><th>Locataire</th><th>Logement</th><th className="num">Loyer</th><th className="num">Doit au total</th><th>Retards</th><th>Prochaine échéance</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {situations.map((item) => (
                    <tr className={`dues-row dues-row--${item.overdueCount > 0 ? "overdue" : item.debtXaf > 0 ? "due" : "settled"}`} key={item.tenantId}>
                      <td data-label="Locataire"><Link href={`/app/locataires/${item.tenantId}`}>{item.tenantName}</Link></td>
                      <td data-label="Logement">{item.unitLabel}<small>{item.propertyName}</small></td>
                      <td className="num" data-label="Loyer">{formatXaf(item.monthlyXaf)}</td>
                      <td className="num" data-label="Doit au total"><strong className={item.debtXaf > 0 ? "due-late" : ""}>{item.debtXaf > 0 ? formatXaf(item.debtXaf) : "À jour"}</strong></td>
                      <td data-label="Retards">{item.overdueCount > 0 ? <>{item.overdueCount} échéance(s)<small>depuis le {shortDate(item.oldestOverdue ?? "")}</small></> : "—"}</td>
                      <td data-label="Prochaine échéance">{item.nextDue ? shortDate(item.nextDue) : "—"}</td>
                      <td className="dues-row__menu"><TenantMenu canManage={canManage} canRecord={canRecord} civility={civilities[item.tenantId] ?? null} item={item} open={openDrawer} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon={CalendarClock} title="Aucun locataire" description="Aucun locataire ne correspond à ces filtres." />
        ) : groups.length ? groups.map((group) => (
          <section className="dues-group" key={group.key}>
            <h2 className="dues-group__title">{group.label}</h2>
            <div className="table-scroll">
              <table className="dues-table">
                <thead><tr><th>Échéance</th><th>Logement</th><th>Locataire</th><th className="num">Montant</th><th className="num">Payé</th><th className="num">Reste</th><th className="num">Solde</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {group.rows.map((row) => {
                    const late = daysLate(row, today);
                    return (
                      <tr className={`dues-row dues-row--${tone(row)}`} key={row.dueId}>
                        <td data-label="Échéance">{shortDate(row.dueDate)}<small>{row.kind === "deposit" ? "Dépôt de garantie" : `${shortDate(row.periodStart)} → ${shortDate(row.periodEnd)}`}</small></td>
                        <td data-label="Logement">{row.unitLabel}<small>{row.propertyName}</small></td>
                        <td data-label="Locataire"><Link href={`/app/locataires/${row.tenantId}`}>{row.tenantName}</Link></td>
                        <td className="num" data-label="Montant">{formatXaf(row.totalXaf)}</td>
                        <td className="num" data-label="Payé">{formatXaf(row.paidXaf)}</td>
                        <td className="num" data-label="Reste"><strong>{formatXaf(row.remainingXaf)}</strong></td>
                        <td className="num" data-label="Solde">{row.balanceXaf === null ? "—" : row.balanceXaf > 0 ? <><strong className="due-late">-{formatXaf(row.balanceXaf)}</strong>{row.carriedXaf > 0 ? <small>Report de solde : {formatXaf(row.carriedXaf)}</small> : null}</> : "À jour"}</td>
                        <td data-label="État"><Badge tone={STATUS[row.status][1]}>{STATUS[row.status][0]}</Badge>{late > 0 ? <small className="due-late">{late} jour(s) de retard</small> : null}</td>
                        <td className="dues-row__menu"><RowMenu canManage={canManage} canRecord={canRecord} civility={civilities[row.tenantId] ?? null} open={openDrawer} row={row} today={today} totalDue={amountsDue[row.tenantId] ?? row.remainingXaf} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )) : <EmptyState icon={CalendarClock} title="Aucune échéance" description="Aucune échéance ne correspond à ces filtres." />}
        {mode === "echeances" && visible.length > 0 ? (
          <div className="dues-footer">
            <span>{Math.min(limit, visible.length)} sur {visible.length} échéance(s)</span>
            <select aria-label="Lignes affichées" onChange={(event) => setLimit(Number(event.target.value))} value={limit}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size} lignes</option>)}</select>
            {visible.length > limit ? <button className="button button--secondary" onClick={() => setLimit(limit + 50)} type="button">Afficher plus</button> : null}
          </div>
        ) : null}
      </Card>
      <DuesDrawer key={drawerKey} onClose={closeDrawer} state={drawer} />
    </div>
  );
}
