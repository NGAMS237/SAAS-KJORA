import Link from "next/link";
import { getActiveAuthorization } from "@/core/authorization/server";
import DuesPage from "../echeances/page";
import PaymentsPage from "../paiements/page";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Refonte — Finances regroupe les échéances (ce qui est attendu) et les paiements reçus.
// Les anciennes adresses /app/echeances et /app/paiements restent valables.
export default async function FinancesPage({ searchParams }: { searchParams: SearchParams }) {
  const [authorization, query] = await Promise.all([getActiveAuthorization(), searchParams]);
  const canSeePayments = authorization?.capabilities.includes("payment.view") ?? false;
  const view = query.vue === "paiements" && canSeePayments ? "paiements" : "echeances";
  const keep = new URLSearchParams();
  for (const key of ["lease", "tenant"]) { const value = query[key]; if (typeof value === "string" && value) keep.set(key, value); }
  const href = (target: string) => { const params = new URLSearchParams(keep); if (target === "paiements") params.set("vue", "paiements"); const q = params.toString(); return `/app/finances${q ? `?${q}` : ""}`; };
  return (
    <div className="page-stack">
      <nav aria-label="Vues Finances" className="finance-tabs">
        <Link aria-current={view === "echeances" ? "page" : undefined} className={`finance-tabs__item${view === "echeances" ? " finance-tabs__item--active" : ""}`} href={href("echeances")}>Échéances</Link>
        {canSeePayments ? <Link aria-current={view === "paiements" ? "page" : undefined} className={`finance-tabs__item${view === "paiements" ? " finance-tabs__item--active" : ""}`} href={href("paiements")}>Paiements reçus</Link> : null}
      </nav>
      {view === "paiements" ? <PaymentsPage searchParams={Promise.resolve(query)} /> : <DuesPage searchParams={Promise.resolve(query)} />}
    </div>
  );
}
