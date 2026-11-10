"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, Search } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/ui";
import { buildWhatsAppUrl } from "@/modules/communications/manual-whatsapp";
import { buildMailtoUrl, firstName, formatXaf, normalizeTenantPhone, renderTemplate, templateByKey } from "@/modules/communications/message-templates";
import type { DueStatus } from "./model";
import { DUE_FILTERS, countByFilter, daysLate, groupByMonth, matchesFilter, matchesSearch, sortRows, summarize, type DueFilter, type DueOverviewRow } from "./overview";

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

export function DuesOverviewView({ rows, canRecord, canManage, scopeLabel, today }: { rows: DueOverviewRow[]; canRecord: boolean; canManage: boolean; scopeLabel: string | null; today: string }) {
  const [filter, setFilter] = useState<DueFilter>("all");
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("all");
  const counts = useMemo(() => countByFilter(rows), [rows]);
  const months = useMemo(() => groupByMonth(rows).map((group) => ({ key: group.key, label: group.label })), [rows]);
  const visible = useMemo(() => rows.filter((row) => matchesFilter(row, filter) && matchesSearch(row, query) && (month === "all" || row.dueDate.startsWith(month))), [rows, filter, query, month]);
  const totals = useMemo(() => summarize(visible), [visible]);
  const groups = useMemo(() => groupByMonth(visible).map((group) => ({ ...group, rows: sortRows(group.rows) })), [visible]);

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
        <div className="dues-toolbar">
          <div className="dues-filters" role="tablist" aria-label="Filtrer les échéances">
            {DUE_FILTERS.map((item) => <button aria-selected={filter === item} className={`dues-filter${filter === item ? " is-active" : ""}`} key={item} onClick={() => setFilter(item)} role="tab" type="button">{FILTER_LABELS[item]} <span>{counts[item]}</span></button>)}
          </div>
          <label className="dues-search"><Search aria-hidden="true" size={15} /><input aria-label="Rechercher" onChange={(event) => setQuery(event.target.value)} placeholder="Locataire, logement…" value={query} /></label>
          <select aria-label="Mois" onChange={(event) => setMonth(event.target.value)} value={month}>
            <option value="all">Tous les mois</option>
            {months.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </div>
        {groups.length ? groups.map((group) => (
          <section className="dues-group" key={group.key}>
            <h2 className="dues-group__title">{group.label}</h2>
            <div className="table-scroll">
              <table className="dues-table">
                <thead><tr><th>Échéance</th><th>Logement</th><th>Locataire</th><th className="num">Montant</th><th className="num">Payé</th><th className="num">Reste</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
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
      </Card>
    </div>
  );
}
