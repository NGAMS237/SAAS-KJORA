import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Building2, House, KeyRound, Landmark, UsersRound, WalletCards } from "lucide-react";
import { Badge, Card } from "@/core/ui/ui";
import { getUserGreetingName } from "@/core/auth/user-display-name";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";
import { PinSetupPrompt } from "@/core/security/pin-controls";
import { listActiveProperties } from "@/modules/properties/server";
import { listLeases, listTenants } from "@/modules/tenancy/server";

function PortfolioMetric({
  href,
  icon: Icon,
  label,
  value,
  note,
  tone = "ink",
}: {
  href?: string;
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  tone?: "ink" | "blue" | "gold" | "neutral";
}) {
  const content = (
    <>
      <span className={`portfolio-metric__icon portfolio-metric__icon--${tone}`} aria-hidden="true">
        <Icon size={20} strokeWidth={1.8} />
      </span>
      <span className="portfolio-metric__label">{label}</span>
      <strong className="portfolio-metric__value financial-value">{value}</strong>
      <span className="portfolio-metric__note">{note}</span>
      {href ? <ArrowRight className="portfolio-metric__arrow" aria-hidden="true" size={17} /> : null}
    </>
  );
  return href ? <Link className="portfolio-metric" href={href}>{content}</Link> : <div className="portfolio-metric">{content}</div>;
}

export default async function DashboardPage() {
  const context = await loadOrganizationContext();
  const organization = context.activeOrganization;
  if (!organization) return null;
  const greetingName = getUserGreetingName(context.user.userMetadata);
  const canViewProperties = organization.capabilities.includes("property.view");
  const canViewTenants = organization.capabilities.includes("tenant.view");
  const canViewLeases = organization.capabilities.includes("lease.view");
  const canViewDues = organization.capabilities.includes("due.view");
  const canManageProperties = organization.capabilities.includes("property.manage");
  const [properties, tenants, leases] = await Promise.all([
    canViewProperties ? listActiveProperties(organization.id) : Promise.resolve([]),
    canViewTenants ? listTenants(organization.id) : Promise.resolve([]),
    canViewLeases ? listLeases(organization.id) : Promise.resolve([]),
  ]);
  const unitCount = properties.reduce((total, property) => total + property.unitCount, 0);
  const vacantCount = properties.reduce((total, property) => total + property.vacantCount, 0);
  const occupiedCount = canViewLeases ? Math.max(0, unitCount - vacantCount) : null;
  const occupancyRate = occupiedCount !== null && unitCount > 0 ? Math.round((occupiedCount / unitCount) * 100) : null;
  const activeLeases = leases.filter((lease) => lease.status === "active");
  const draftLeases = leases.filter((lease) => lease.status === "draft");
  const endedLeases = leases.filter((lease) => lease.status === "ended");
  const activeTenantCount = canViewTenants ? tenants.filter((tenant) => tenant.currentLease).length : null;
  const monthLabel = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: organization.timezone,
  }).format(new Date());

  return (
    <div className="page-stack dashboard-v2">
      <section className="dashboard-hero">
        <div className="dashboard-hero__content">
          <p className="dashboard-hero__eyebrow">Accueil · {monthLabel}</p>
          <h1>{greetingName ? `Bonjour, ${greetingName}` : "Bonjour"}</h1>
          <p>Votre patrimoine, vos locations et leur situation financière dans une vue claire.</p>
          <div className="dashboard-hero__actions">
            <Link className="button button--accent" href={canManageProperties ? "/app/biens/nouveau" : "/app/biens"}>
              {canManageProperties ? "Ajouter un bien" : "Voir les biens"}
              <ArrowRight aria-hidden="true" size={17} />
            </Link>
            {canViewLeases ? <Link className="button button--on-dark" href="/app/locations">Voir les locations</Link> : null}
          </div>
        </div>
        <div className="dashboard-hero__portfolio" aria-label="Aperçu du patrimoine">
          <span className="dashboard-hero__mark" aria-hidden="true"><Landmark size={24} /></span>
          <small>Organization active</small>
          <strong>{organization.name}</strong>
          <p>{canViewProperties ? `${properties.length} bien${properties.length === 1 ? "" : "s"} · ${unitCount} unité${unitCount === 1 ? "" : "s"}` : "Patrimoine selon vos autorisations"}</p>
        </div>
      </section>
      <PinSetupPrompt />

      <section className="dashboard-metrics" aria-label="Aperçu réel de l’Organization active">
        <PortfolioMetric href={canViewProperties ? "/app/biens" : undefined} icon={Building2} label="Biens" value={canViewProperties ? String(properties.length) : "—"} note={canViewProperties ? "Actifs dans cette Organization" : "Non accessible à ce rôle"} />
        <PortfolioMetric href={canViewProperties ? "/app/biens" : undefined} icon={House} label="Unités" value={canViewProperties ? String(unitCount) : "—"} note={canViewProperties ? `${vacantCount} vacante${vacantCount === 1 ? "" : "s"}` : "Non accessible à ce rôle"} tone="blue" />
        <PortfolioMetric icon={KeyRound} label="Occupation" value={occupancyRate === null ? "—" : `${occupancyRate} %`} note={occupiedCount === null ? "Disponible selon vos autorisations" : `${occupiedCount} unité${occupiedCount === 1 ? "" : "s"} occupée${occupiedCount === 1 ? "" : "s"}`} tone="gold" />
        <PortfolioMetric href={canViewTenants ? "/app/locataires" : undefined} icon={UsersRound} label="Locataires actifs" value={activeTenantCount === null ? "—" : String(activeTenantCount)} note={canViewTenants ? `${tenants.length} dossier${tenants.length === 1 ? "" : "s"} au total` : "Non accessible à ce rôle"} tone="neutral" />
      </section>

      <div className="dashboard-lower-grid">
        <Card className="dashboard-lease-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Cycle locatif</p>
              <h2>Locations en cours</h2>
            </div>
            {canViewLeases ? <Badge tone="success">Données réelles</Badge> : <Badge>Accès limité</Badge>}
          </div>
          <div className="dashboard-lease-stats">
            <div><strong>{canViewLeases ? activeLeases.length : "—"}</strong><span>Actives</span></div>
            <div><strong>{canViewLeases ? draftLeases.length : "—"}</strong><span>Brouillons</span></div>
            <div><strong>{canViewLeases ? endedLeases.length : "—"}</strong><span>Terminées</span></div>
          </div>
          {canViewLeases ? <Link className="dashboard-inline-link" href="/app/locations">Ouvrir toutes les locations <ArrowRight aria-hidden="true" size={16} /></Link> : <p className="dashboard-card-note">Cette synthèse suit les permissions de votre rôle.</p>}
        </Card>

        <Card className="dashboard-finance-card">
          <span className="dashboard-finance-card__icon" aria-hidden="true"><WalletCards size={22} /></span>
          <div>
            <p className="eyebrow">Suivi financier</p>
            <h2>{canViewDues ? "Échéances et Ledger disponibles" : "Données selon vos autorisations"}</h2>
            <p>{canViewDues ? "Consultez le solde dû, le crédit disponible, les périodes couvertes et la prochaine échéance non couverte depuis les locations et les dossiers locataires." : "Les informations financières restent protégées selon le rôle actif."}</p>
          </div>
          {canViewDues ? <Badge tone="success">Données réelles</Badge> : <Badge>Accès limité</Badge>}
        </Card>
      </div>
    </div>
  );
}
