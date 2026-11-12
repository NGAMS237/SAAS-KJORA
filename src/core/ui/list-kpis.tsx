"use client";

// Chiffres cliquables en tête de liste : chacun filtre la liste (gabarit commun Locataires, Locations, Biens).
export type ListSegment<K extends string> = { key: K; label: string; count: number; danger?: boolean };

export function ListKpis<K extends string>({ segments, active, onChange, label }: { segments: ListSegment<K>[]; active: K; onChange: (key: K) => void; label: string }) {
  return (
    <div aria-label={label} className="list-kpis" role="group">
      {segments.map((segment) => (
        <button aria-pressed={active === segment.key} className={`list-kpi${active === segment.key ? " list-kpi--active" : ""}${segment.danger && segment.count > 0 ? " list-kpi--danger" : ""}`} key={segment.key} onClick={() => onChange(segment.key)} type="button">
          <small>{segment.label}</small><strong>{segment.count}</strong>
        </button>
      ))}
    </div>
  );
}

// Alerte d'action en haut de liste (ex. « 4 locataires sans e-mail »).
export function ListAlert({ children, actionLabel, onAction }: { children: React.ReactNode; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="list-alert" role="status">
      <span>{children}</span>
      {actionLabel && onAction ? <button className="list-alert__action" onClick={onAction} type="button">{actionLabel} →</button> : null}
    </div>
  );
}
