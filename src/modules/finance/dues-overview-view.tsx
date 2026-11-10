"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, Search } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/ui";
import { buildWhatsAppUrl } from "@/modules/communications/manual-whatsapp";
import { buildMailtoUrl, firstName, formatXaf, normalizeTenantPhone, renderTemplate, templateByKey } from "@/modules/communications/message-templates";
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

function RowMenu({ row, canRecord, canManage, today }: { row: DueOverviewRow; canRecord: boolean; canManage: boolean; today: string }) {
  const open = row.remainingXaf > 0 && row.status !== "cancelled";
  const template = templateByKey(row.status === "overdue" ? "retard" : "rappel_avant");
  const message = renderTemplate(template.body, {
    prenom: firstName(row.tenantName), nom: row.tenantName, logement: row.unitLabel, du: formatXaf(row.remainingXaf),
    total: formatXaf(row.totalXaf), jour: String(Number(row.dueDate.slice(8, 10))), signature: "Cordialement.",
  });
  const phone = normalizeTenantPhone(row.phone);
  const whatsapp = open && phone ? buildWhatsAppUrl(phone, message) : null;
  const mail = open && row.email ? buildMailtoUrl(row.email, template.subject, message) : null;
  void today;
  return (
    <details className="row-menu">
      <summary aria-label={`Actions pour ${row.tenantName}`}>⋯</summary>
      <div className="row-menu__panel">
        {canRecord && open ? <Link href={`/app/paiements/nouveau?lease=${row.leaseId}&amount=${row.remainingXaf}`}>Enregistrer un paiement</Link> : null}
        {whatsapp ? <a href={whatsapp} rel="noopener noreferrer" target="_blank">{row.status === "overdue" ? "Relancer par WhatsApp" : "Rappeler par WhatsApp"}</a> : null}
        {mail ? <a href={mail}>Écrire par e-mail</a> : null}
        <Link href={`/app/locations/${row.leaseId}#documents`}>Avis, reçus et quittances</Link>
        <Link href={`/app/locataires/${row.tenantId}/etat-de-compte`}>État de compte</Link>
        <Link href={`/app/locataires/${row.tenantId}`}>Voir le locataire</Link>
        <Link href={`/app/locations/${row.leaseId}`}>Voir le bail</Link>
        {canManage ? <Link href={`/app/locations/${row.leaseId}#changer-loyer`}>Modifier le loyer</Link> : null}
        {open && !phone ? <small>Pas de numéro WhatsApp reconnu pour ce locataire.</small> : null}
      </div>
    </details>
  );
}

function TenantMenu({ item, canRecord, canManage }: { item: TenantSituation; canRecord: boolean; canManage: boolean }) {
  const owes = item.debtXaf > 0;
  const template = templateByKey("retard");
  const message = renderTemplate(template.body, { prenom: firstName(item.tenantName), nom: item.tenantName, logement: item.unitLabel, du: formatXaf(item.debtXaf), total: formatXaf(item.monthlyXaf), signature: "Cordialement." });
  const phone = normalizeTenantPhone(item.phone);
  const whatsapp = owes && phone ? buildWhatsAppUrl(phone, message) : null;
  const mail = owes && item.email ? buildMailtoUrl(item.email, template.subject, message) : null;
  return (
    <details className="row-menu">
      <summary aria-label={`Actions pour ${item.tenantName}`}>⋯</summary>
      <div className="row-menu__panel">
        {canRecord && owes ? <Link href={`/app/paiements/nouveau?lease=${item.leaseId}&amount=${item.debtXaf}`}>Enregistrer un paiement</Link> : null}
        {whatsapp ? <a href={whatsapp} rel="noopener noreferrer" target="_blank">Relancer par WhatsApp</a> : null}
        {mail ? <a href={mail}>Écrire par e-mail</a> : null}
        <Link href={`/app/echeances?tenant=${item.tenantId}`}>Voir ses échéances</Link>
        <Link href={`/app/locataires/${item.tenantId}/etat-de-compte`}>État de compte</Link>
        <Link href={`/app/locataires/${item.tenantId}`}>Voir le locataire</Link>
        <Link href={`/app/locations/${item.leaseId}`}>Voir le bail</Link>
        {canManage ? <Link href={`/app/locations/${item.leaseId}#changer-loyer`}>Modifier le loyer</Link> : null}
        {owes && !phone ? <small>Pas de numéro WhatsApp reconnu pour ce locataire.</small> : null}
      </div>
    </details>
  );
}

const PAGE_SIZES = [30, 50, 100];

export function DuesOverviewView({ rows: baseRows, amountsDue, canRecord, canManage, scopeLabel, today }: { rows: DueOverviewRow[]; amountsDue: Record<string, number>; canRecord: boolean; canManage: boolean; scopeLabel: string | null; today: string }) {
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
      <PageHeader eyebrow="Finances" title="Échéances" description="Toutes les échéances en un seul tableau. Le menu ⋯ de chaque ligne donne les actions : paiement, relance, documents." action={canRecord ? <Link className="button button--primary" href="/app/paiements/nouveau">Enregistrer un paiement</Link> : undefined} />
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
                      <td className="dues-row__menu"><TenantMenu canManage={canManage} canRecord={canRecord} item={item} /></td>
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
                        <td className="dues-row__menu"><RowMenu canManage={canManage} canRecord={canRecord} row={row} today={today} /></td>
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
    </div>
  );
}
