import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowRight, Inbox } from "lucide-react";

export function DemoNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "demo-notice demo-notice--compact" : "demo-notice"}>
      <span className="demo-notice__dot" aria-hidden="true" />
      <span>Données fictives · Lot 5A</span>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p className="page-header__description">{description}</p>
      </div>
      {action ? <div className="page-header__action">{action}</div> : null}
    </header>
  );
}

export function Card({
  children,
  className = "",
  muted = false,
}: {
  children: ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return <section className={`card${muted ? " card--muted" : ""} ${className}`}>{children}</section>;
}

export function KpiCard({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "default" | "positive" | "warning";
}) {
  return (
    <Card className={`kpi-card kpi-card--${tone}`}>
      <p className="kpi-card__label">{label}</p>
      <strong className="kpi-card__value financial-value">{value}</strong>
      <p className="kpi-card__note">{note}</p>
    </Card>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "due";
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function ActionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="button button--primary" href={href}>
      {children}
      <ArrowRight aria-hidden="true" size={17} strokeWidth={1.8} />
    </Link>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">
        <Icon size={25} strokeWidth={1.7} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}

export function SkeletonBlock({ label = "Chargement du contenu" }: { label?: string }) {
  return (
    <div className="skeleton-block" role="status" aria-label={label}>
      <span className="skeleton skeleton--short" />
      <span className="skeleton" />
      <span className="skeleton skeleton--medium" />
    </div>
  );
}

export function ErrorNotice({
  title = "Impossible de charger cette section",
  description = "Vérifiez votre connexion puis réessayez. Aucune donnée n’a été modifiée.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="error-notice" role="alert">
      <AlertTriangle aria-hidden="true" size={20} strokeWidth={1.8} />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function ListRow({
  title,
  description,
  trailing,
  icon: Icon,
  className = "",
}: {
  title: string;
  description: string;
  trailing?: ReactNode;
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <div className={`list-row ${className}`}>
      <span className="list-row__icon" aria-hidden="true">
        <Icon size={19} strokeWidth={1.7} />
      </span>
      <div className="list-row__body">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      {trailing ? <div className="list-row__trailing">{trailing}</div> : null}
    </div>
  );
}
