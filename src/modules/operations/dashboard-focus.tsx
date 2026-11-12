import Link from "next/link";
import { CalendarClock, MessageCircle } from "lucide-react";
import { Card } from "@/core/ui/ui";
import { dueBreakdown } from "@/modules/finance/model";
import { listDuesForOverview, listTenantAmountsDue } from "@/modules/finance/server";
import { listLeases, listTenants } from "@/modules/tenancy/server";

const xaf = (value: number) => `${Math.round(value).toLocaleString("fr-FR").replace(/[  ]/g, " ")} XAF`;
const short = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const weekday = (iso: string) => new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

// Refonte — bloc d'accueil « À relancer en priorité » + « Cette semaine » (inspiré du Bureau Rentila).
export async function DashboardFocus({ organizationId, today = new Date() }: { organizationId: string; today?: Date }) {
  const todayIso = today.toISOString().slice(0, 10);
  const weekIso = new Date(today.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const monthIso = new Date(today.getTime() + 45 * 86_400_000).toISOString().slice(0, 10);
  const [amounts, tenants, leases, dues] = await Promise.all([
    listTenantAmountsDue(organizationId).catch(() => ({} as Record<string, number>)),
    listTenants(organizationId).catch(() => []),
    listLeases(organizationId).catch(() => []),
    listDuesForOverview(organizationId).catch(() => []),
  ]);
  const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  const leaseById = new Map(leases.map((lease) => [lease.id, lease]));
  const late = Object.entries(amounts).filter(([, amount]) => amount > 0).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .flatMap(([tenantId, amount]) => { const tenant = tenantById.get(tenantId); return tenant ? [{ tenant, amount }] : []; });
  const agenda = [
    ...dues.filter((due) => due.dueDate >= todayIso && due.dueDate <= weekIso && due.kind !== "adjustment" && dueBreakdown(due).remainingXaf > 0)
      .map((due) => { const lease = leaseById.get(due.leaseId); return { date: due.dueDate, label: `Échéance · ${lease?.unitLabel ?? ""} · ${lease?.tenantName ?? ""}`, value: xaf(dueBreakdown(due).remainingXaf), tone: "" }; }),
    ...leases.filter((lease) => lease.status === "active" && lease.endDate && lease.endDate >= todayIso && lease.endDate <= monthIso)
      .map((lease) => ({ date: lease.endDate as string, label: `Fin de bail · ${lease.unitLabel} · ${lease.tenantName}`, value: "à renouveler", tone: "is-due" })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  if (!late.length && !agenda.length) return null;
  return (
    <div className="dashboard-focus">
      <Card>
        <div className="section-heading"><div><p className="eyebrow">Retards</p><h2>À relancer en priorité</h2></div><MessageCircle size={22} /></div>
        {late.length ? <div className="focus-list">{late.map(({ tenant, amount }) => (
          <div className="focus-row" key={tenant.id}>
            <Link href={`/app/locataires/${tenant.id}#echeances`}><strong>{tenant.fullName}</strong><small>{tenant.currentLease?.unitLabel ?? "—"}</small></Link>
            <strong className="financial-value is-due">{xaf(amount)}</strong>
            <Link className="button button--primary" href={`/app/finances?tenant=${tenant.id}`}>Relancer</Link>
          </div>))}
          <Link className="focus-more" href="/app/finances">Voir tous les retards →</Link>
        </div> : <p className="field-help">Aucun retard : tous les locataires sont à jour.</p>}
      </Card>
      <Card>
        <div className="section-heading"><div><p className="eyebrow">Agenda</p><h2>Prochains jours</h2></div><CalendarClock size={22} /></div>
        {agenda.length ? <div className="focus-list">{agenda.map((item, index) => (
          <div className="focus-row focus-row--agenda" key={`${item.date}-${index}`}>
            <span><strong>{weekday(item.date)} {short(item.date)}</strong><small>{item.label}</small></span>
            <strong className={`financial-value ${item.tone}`}>{item.value}</strong>
          </div>))}</div> : <p className="field-help">Rien de prévu cette semaine.</p>}
      </Card>
    </div>
  );
}
