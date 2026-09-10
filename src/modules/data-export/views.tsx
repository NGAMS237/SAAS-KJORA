"use client";

// EXPORT-01 — UI Paramètres → Mes données (§4).
// Deux temps explicites : "Préparer l'export" (calcule le périmètre et les
// compteurs, journalise la demande) puis "Télécharger" (génère et sert le
// fichier). Aucune écriture métier n'a jamais lieu depuis cet écran.

import { useState } from "react";
import { Download, FileArchive, FileSpreadsheet, FileText, Lock } from "lucide-react";
import { FeatureUpgradeModal } from "@/core/entitlements/feature-upgrade-modal";
import type { PlanSlug } from "@/core/entitlements/model";
import {
  EXPORT_SCOPES,
  XLSX_STANDARD_SCOPES,
  type ExportFormat,
  type ExportHistoryEntry,
  type ExportRowCounts,
  type ExportScope,
} from "@/modules/data-export/model";

const SCOPE_LABELS: Record<ExportScope, string> = {
  properties: "Biens",
  units: "Logements",
  tenants: "Locataires",
  leases: "Locations",
  dues: "Échéances",
  payments: "Paiements",
  payment_allocations: "Allocations",
  credits: "Crédits",
  deposits: "Dépôts",
  account_statements: "Situation des comptes",
  financial_documents: "Documents financiers",
  contracts: "Contrats",
};

const FORMAT_META: Record<ExportFormat, { label: string; description: string; icon: typeof FileText }> = {
  csv: { label: "CSV", description: "Une seule table à la fois, pour un tableur simple.", icon: FileText },
  xlsx: { label: "XLSX", description: "Classeur Excel multi-feuilles (Biens, Locations, Échéances, Paiements…).", icon: FileSpreadsheet },
  zip: { label: "ZIP global", description: "Le classeur XLSX complet + les documents financiers et contrats en PDF.", icon: FileArchive },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function friendlyPrepareError(code: string | undefined): string {
  switch (code) {
    case "PLAN_FEATURE_NOT_AVAILABLE":
      return "Votre offre actuelle n’inclut pas ce type d’export.";
    case "forbidden":
      return "Vous n’avez pas les droits nécessaires pour exporter les données de cette Organization.";
    case "invalid_export_range":
      return "La période choisie n’est pas valide (la date de fin doit suivre la date de début).";
    case "billing_blocked":
      return "L’export reste accessible même en cas de facturation bloquée ; réessayez ou contactez le support si le blocage persiste.";
    default:
      return "Impossible de préparer cet export pour le moment.";
  }
}

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const parsed = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { ok: response.ok, body: parsed };
}

type PreparedExport = { exportId: string; format: ExportFormat; scope: ExportScope[]; rowCounts: ExportRowCounts; estimatedBytes: number };

export function DataExportView({
  currentPlan,
  canUseAdvancedExports,
  initialHistory,
}: {
  currentPlan: PlanSlug;
  canUseAdvancedExports: boolean;
  initialHistory: ExportHistoryEntry[];
}) {
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [csvScope, setCsvScope] = useState<ExportScope>("properties");
  const [xlsxScopes, setXlsxScopes] = useState<Set<ExportScope>>(new Set(XLSX_STANDARD_SCOPES));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedExport | null>(null);
  const [showAdvancedUpgrade, setShowAdvancedUpgrade] = useState(false);
  const [history, setHistory] = useState(initialHistory);

  function selectFormat(next: ExportFormat) {
    if (next === "zip" && !canUseAdvancedExports) {
      setShowAdvancedUpgrade(true);
      return;
    }
    setFormat(next);
    setPrepared(null);
    setError(null);
  }

  function toggleXlsxScope(scope: ExportScope) {
    setXlsxScopes((current) => {
      const next = new Set(current);
      if (next.has(scope)) next.delete(scope); else next.add(scope);
      return next;
    });
  }

  async function prepare() {
    setBusy(true); setError(null); setPrepared(null);
    const scope = format === "csv" ? [csvScope] : format === "xlsx" ? Array.from(xlsxScopes) : undefined;
    const result = await postJson("/api/data-export/prepare", { format, scope, from: from || null, to: to || null });
    setBusy(false);
    if (!result.ok) { setError(friendlyPrepareError(result.body.error as string | undefined)); return; }
    const body = result.body as PreparedExport;
    setPrepared(body);
    setHistory((current) => [{
      id: body.exportId, format: body.format, scope: body.scope, status: "ready",
      rowCounts: body.rowCounts, requestedAt: new Date().toISOString(), downloadedAt: null, downloadedCount: 0,
    }, ...current]);
  }

  const totalRows = prepared ? Object.values(prepared.rowCounts).reduce((sum, n) => sum + (n ?? 0), 0) : 0;

  return (
    <div className="page-stack">
      <div className="export-format-grid">
        {(Object.keys(FORMAT_META) as ExportFormat[]).map((key) => {
          const meta = FORMAT_META[key];
          const Icon = meta.icon;
          const locked = key === "zip" && !canUseAdvancedExports;
          return (
            <button
              className={`export-format-option${format === key ? " is-selected" : ""}`}
              key={key}
              onClick={() => selectFormat(key)}
              type="button"
            >
              <Icon size={20} />
              <strong>{meta.label}</strong>
              <span>{meta.description}</span>
              {locked ? <span className="premium-badge"><Lock size={12} aria-hidden="true" />Avancé</span> : null}
            </button>
          );
        })}
      </div>

      {format === "csv" ? (
        <label className="field">
          <span>Table à exporter</span>
          <select onChange={(event) => setCsvScope(event.target.value as ExportScope)} value={csvScope}>
            {EXPORT_SCOPES.filter((scope) => scope !== "financial_documents" && scope !== "contracts").map((scope) => (
              <option key={scope} value={scope}>{SCOPE_LABELS[scope]}</option>
            ))}
          </select>
        </label>
      ) : null}

      {format === "xlsx" ? (
        <fieldset className="export-scope-fieldset">
          <legend>Feuilles à inclure</legend>
          <div className="export-scope-grid">
            {XLSX_STANDARD_SCOPES.map((scope) => (
              <label className="export-scope-checkbox" key={scope}>
                <input checked={xlsxScopes.has(scope)} onChange={() => toggleXlsxScope(scope)} type="checkbox" />
                {SCOPE_LABELS[scope]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {format === "zip" ? (
        <p className="demo-hint">
          Le ZIP inclut automatiquement toutes les feuilles du classeur XLSX, ainsi que les documents financiers et
          contrats déjà générés, en PDF.
        </p>
      ) : null}

      <div className="export-date-range">
        <label className="field"><span>Depuis (facultatif)</span><input onChange={(event) => setFrom(event.target.value)} type="date" value={from} /></label>
        <label className="field"><span>Jusqu’au (facultatif)</span><input onChange={(event) => setTo(event.target.value)} type="date" value={to} /></label>
        <small>S’applique aux échéances, paiements et crédits. Les biens, logements, locataires et locations sont toujours exportés en entier.</small>
      </div>

      <div className="demo-form-actions">
        <button className="button button--primary" disabled={busy || (format === "xlsx" && xlsxScopes.size === 0)} onClick={prepare} type="button">
          {busy ? "Préparation…" : "Préparer l’export"}
        </button>
      </div>

      {error ? <p className="form-feedback form-feedback--error" role="alert">{error}</p> : null}

      {prepared ? (
        <div className="card export-ready-card">
          <div className="section-heading">
            <div><p className="eyebrow">Export prêt</p><h2>{totalRows.toLocaleString("fr-FR")} ligne(s) · environ {formatBytes(prepared.estimatedBytes)}</h2></div>
          </div>
          <ul className="export-row-counts">
            {Object.entries(prepared.rowCounts).map(([scope, count]) => (
              <li key={scope}><span>{SCOPE_LABELS[scope as ExportScope] ?? scope}</span><strong>{count}</strong></li>
            ))}
          </ul>
          <a
            className="button button--accent"
            href={`/api/data-export/download?exportId=${prepared.exportId}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Download size={16} />Télécharger
          </a>
        </div>
      ) : null}

      <div className="card export-history-card">
        <div className="section-heading"><div><p className="eyebrow">Historique</p><h2>Exports récents</h2></div></div>
        {history.length ? (
          <div className="demo-list">
            {history.map((entry) => {
              const EntryIcon = FORMAT_META[entry.format].icon;
              return (
                <div className="demo-list-row" key={entry.id}>
                  <span className="demo-list-row__icon"><EntryIcon size={18} /></span>
                  <div>
                    <strong>{FORMAT_META[entry.format].label} · {entry.scope.length} feuille(s)</strong>
                    <span>{new Date(entry.requestedAt).toLocaleString("fr-FR")}</span>
                  </div>
                  <span>{entry.downloadedAt ? `Téléchargé ${entry.downloadedCount}×` : "Non téléchargé"}</span>
                </div>
              );
            })}
          </div>
        ) : <p>Aucun export préparé pour l’instant.</p>}
      </div>

      {showAdvancedUpgrade ? (
        <FeatureUpgradeModal
          currentPlan={currentPlan}
          feature="exports_advanced"
          message="Votre offre actuelle n’inclut pas encore l’export global ZIP (classeur complet + documents PDF). Cette fonctionnalité est disponible à partir de l’offre Avancé. L’export CSV et XLSX standard restent disponibles."
          minimumPlan="avance"
          onClose={() => setShowAdvancedUpgrade(false)}
          title="L’export global n’est pas inclus dans votre offre"
        />
      ) : null}
    </div>
  );
}
