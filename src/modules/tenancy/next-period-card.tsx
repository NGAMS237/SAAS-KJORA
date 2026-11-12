import { CalendarClock } from "lucide-react";
import { Card } from "@/core/ui/ui";
import { nextPeriodPreview } from "@/modules/tenancy/next-period";

const d = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
const xaf = (value: number) => `${value.toLocaleString("fr-FR").replace(/[  ]/g, " ")} XAF`;

export function NextPeriodCard({ nextPeriodStart, dueDay, generateDueDaysBefore, totalXaf }: { nextPeriodStart: string; dueDay: number; generateDueDaysBefore: number; totalXaf: number }) {
  const p = nextPeriodPreview({ nextPeriodStart, dueDay, generateDueDaysBefore, totalXaf });
  return (
    <Card>
      <div className="section-heading"><div><p className="eyebrow">Calendrier</p><h2>Prochaine période</h2></div><CalendarClock size={22} /></div>
      <div className="next-period">
        <div><small>Avis préparé le</small><strong>{d(p.noticeDate)}</strong></div>
        <div><small>Période</small><strong>{d(p.periodStart)} → {d(p.periodEnd)}</strong></div>
        <div><small>À payer le</small><strong>{d(p.dueDate)}</strong></div>
        <div><small>Montant</small><strong>{xaf(p.totalXaf)}</strong></div>
      </div>
      <p className="field-help">Échéance le {dueDay} du mois, avis préparé {generateDueDaysBefore} jour{generateDueDaysBefore > 1 ? "s" : ""} avant. Exemple calculé avec les conditions actuelles du bail.</p>
    </Card>
  );
}
