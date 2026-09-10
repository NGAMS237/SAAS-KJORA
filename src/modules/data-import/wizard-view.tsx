"use client";

// IMPORT-01 — assistant d'import en 7 étapes (§7).
//
// Vocabulaire non comptable côté UI (§17) : on parle de "situation au moment
// de l'import", jamais de "solde d'ouverture comptable". Aucune écriture
// métier n'a lieu avant l'étape 7 (§8) — les étapes 1 à 6 n'appellent que
// /api/data-import/preview, qui ne fait que lire le contexte existant.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card, PageHeader } from "@/core/ui/ui";
import type {
  ColumnMapping,
  DuplicateResolution,
  ImportPreviewResult,
  ImportTargetField,
} from "@/modules/data-import/model";
import { IMPORT_TARGET_FIELDS, REQUIRED_TARGET_FIELDS } from "@/modules/data-import/model";
import { buildCommitPayload, type FinalizedRowInput } from "@/modules/data-import/commit-payload";

const FIELD_LABELS: Record<ImportTargetField, string> = {
  property_name: "Nom du bien",
  property_locality: "Localité du bien",
  property_type: "Type de bien (maison / immeuble)",
  unit_label: "Libellé du logement",
  unit_type: "Type de logement",
  unit_area_sqm: "Surface (m²)",
  tenant_full_name: "Nom du locataire",
  tenant_phone: "Téléphone du locataire",
  tenant_email: "E-mail du locataire",
  lease_start_date: "Date de début de bail",
  lease_billing_frequency: "Fréquence de paiement",
  lease_due_day: "Jour d'échéance",
  lease_base_rent_xaf: "Loyer de base (XAF)",
  lease_recurring_charges_xaf: "Charges récurrentes (XAF)",
  opening_situation_kind: "Situation au moment de l'import (à jour / dette / crédit)",
  opening_situation_amount_xaf: "Montant de la situation d'ouverture (XAF)",
  security_deposit_xaf: "Dépôt de garantie exigé (XAF)",
  deposit_situation_status: "Statut du dépôt de garantie",
  deposit_paid_amount_xaf: "Montant du dépôt déjà payé (XAF)",
};

type StepKey = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type ResolutionsByRow = Map<number, Partial<Record<"property" | "unit" | "tenant", { resolution: DuplicateResolution; existingId: string | null }>>>;

async function requestPreview(file: File, migrationAsOfDate: string, columnMapping?: ColumnMapping[]): Promise<ImportPreviewResult> {
  const form = new FormData();
  form.set("file", file);
  form.set("migrationAsOfDate", migrationAsOfDate);
  if (columnMapping) form.set("columnMapping", JSON.stringify(columnMapping));
  const response = await fetch("/api/data-import/preview", { method: "POST", body: form });
  const payload = (await response.json()) as ImportPreviewResult & { error?: string; message?: string };
  if (!response.ok) throw new Error(payload.message ?? payload.error ?? "preview_failed");
  return payload;
}

export function DataImportWizardView() {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [migrationAsOfDate, setMigrationAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [mappingDraft, setMappingDraft] = useState<ColumnMapping[]>([]);
  const [skippedRows, setSkippedRows] = useState<Set<number>>(new Set());
  const [resolutions, setResolutions] = useState<ResolutionsByRow>(new Map());
  const [commitResult, setCommitResult] = useState<{ createdProperties: number; matchedProperties: number; createdUnits: number; matchedUnits: number; createdTenants: number; matchedTenants: number; createdLeases: number; skippedRows: number; alreadyImported: boolean } | null>(null);

  const rowsWithErrors = useMemo(() => preview?.rows.filter((r) => r.issues.some((i) => i.severity === "error")) ?? [], [preview]);
  const duplicateRows = useMemo(() => preview?.rows.filter((r) => r.duplicates.length > 0 && !rowsWithErrors.includes(r)) ?? [], [preview, rowsWithErrors]);
  const importableRowCount = useMemo(() => (preview?.rows.length ?? 0) - rowsWithErrors.length - skippedRows.size + [...skippedRows].filter((n) => rowsWithErrors.some((r) => r.rowNumber === n)).length, [preview, rowsWithErrors, skippedRows]);

  async function runPreview(nextFile: File, nextMapping?: ColumnMapping[]) {
    setBusy(true); setError("");
    try {
      const result = await requestPreview(nextFile, migrationAsOfDate, nextMapping);
      setPreview(result);
      setMappingDraft(result.columnMapping);
      setSkippedRows(new Set(result.rows.filter((r) => r.issues.some((i) => i.severity === "error")).map((r) => r.rowNumber)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "preview_failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleFileChosen() {
    if (!file) return;
    await runPreview(file);
    setStep(2);
  }

  async function applyMappingAndRevalidate() {
    if (!file) return;
    await runPreview(file, mappingDraft);
    setStep(4);
  }

  function toggleSkip(rowNumber: number) {
    setSkippedRows((current) => {
      const next = new Set(current);
      if (next.has(rowNumber)) next.delete(rowNumber); else next.add(rowNumber);
      return next;
    });
  }

  function setResolution(rowNumber: number, entityType: "property" | "unit" | "tenant", resolution: DuplicateResolution, existingId: string | null) {
    setResolutions((current) => {
      const next = new Map(current);
      const forRow = { ...(next.get(rowNumber) ?? {}) };
      forRow[entityType] = { resolution, existingId };
      next.set(rowNumber, forRow);
      return next;
    });
  }

  async function handleCommit() {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      const finalized: FinalizedRowInput[] = preview.rows.map((r) => ({
        rowNumber: r.rowNumber,
        skip: skippedRows.has(r.rowNumber),
        row: r.normalized,
        duplicateResolutions: resolutions.get(r.rowNumber) ?? {},
      }));
      const rows = buildCommitPayload(finalized);
      const response = await fetch("/api/data-import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: preview.fileName, fileSha256: preview.fileSha256, source: preview.source, migrationAsOfDate, rows }),
      });
      const payload = await response.json() as { error?: string; message?: string; alreadyImported?: boolean; createdProperties?: number; matchedProperties?: number; createdUnits?: number; matchedUnits?: number; createdTenants?: number; matchedTenants?: number; createdLeases?: number; skippedRows?: number; suggestedUpgrade?: string };
      if (!response.ok) {
        if (payload.error?.startsWith("PLAN_")) {
          throw new Error(`Le plan actuel ne permet pas cet import (${payload.error}). Passez à une offre supérieure pour continuer.`);
        }
        throw new Error(payload.message ?? payload.error ?? "commit_failed");
      }
      setCommitResult({
        alreadyImported: payload.alreadyImported ?? false,
        createdProperties: payload.createdProperties ?? 0, matchedProperties: payload.matchedProperties ?? 0,
        createdUnits: payload.createdUnits ?? 0, matchedUnits: payload.matchedUnits ?? 0,
        createdTenants: payload.createdTenants ?? 0, matchedTenants: payload.matchedTenants ?? 0,
        createdLeases: payload.createdLeases ?? 0, skippedRows: payload.skippedRows ?? 0,
      });
      setStep(7);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "commit_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack data-import-wizard">
      <PageHeader
        eyebrow="Paramètres"
        title="Importer mes données"
        description="Reprenez la situation réelle de vos biens, logements, locataires et baux à la date de la migration — sans recréer un faux historique de paiements."
        action={<a className="button button--secondary" href="/api/data-import/template">Télécharger le modèle</a>}
      />

      <div className="section-heading"><div><p className="eyebrow">Étape {step} sur 7</p><h2>{stepTitle(step)}</h2></div></div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {step === 1 ? (
        <Card>
          <div className="form-grid">
            <label className="field">
              <span>Fichier (.csv ou .xlsx)</span>
              <input type="file" accept=".csv,.xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </label>
            <label className="field">
              <span>Date de la migration (situation arrêtée à cette date)</span>
              <input type="date" value={migrationAsOfDate} onChange={(event) => setMigrationAsOfDate(event.target.value)} />
            </label>
          </div>
          <p className="field-help">KJORA reprend la situation réelle à cette date : les baux déjà en cours gardent leur vraie date de début, seul un arriéré ou une avance éventuelle est enregistré comme mouvement d&apos;ouverture — jamais comme un faux historique de paiements.</p>
          <button className="button button--primary" disabled={!file || busy} onClick={handleFileChosen}>Analyser le fichier</button>
        </Card>
      ) : null}

      {step === 2 && preview ? (
        <Card>
          <p>Fichier analysé : <strong>{preview.fileName}</strong> — {preview.totalRows} ligne(s) détectée(s).</p>
          <p className="field-help">Chaque ligne décrit un bail (bien, logement le cas échéant, locataire, et sa situation au moment de l&apos;import).</p>
          <button className="button button--primary" onClick={() => setStep(3)}>Continuer vers la correspondance des colonnes</button>
        </Card>
      ) : null}

      {step === 3 && preview ? (
        <Card>
          <p className="field-help">Associez chaque colonne de votre fichier au champ KJORA correspondant. Les champs obligatoires sont marqués *.</p>
          <div className="page-stack">
            {mappingDraft.map((entry, index) => (
              <div className="list-row" key={entry.sourceColumn}>
                <div className="list-row__body"><strong>{entry.sourceColumn}</strong></div>
                <div className="list-row__trailing">
                  <select
                    value={entry.targetField ?? ""}
                    onChange={(event) => {
                      const value = event.target.value || null;
                      setMappingDraft((current) => current.map((item, position) => position === index ? { ...item, targetField: value as ImportTargetField | null } : item));
                    }}
                  >
                    <option value="">Ignorer cette colonne</option>
                    {IMPORT_TARGET_FIELDS.map((field) => (
                      <option key={field} value={field}>{FIELD_LABELS[field]}{REQUIRED_TARGET_FIELDS.includes(field) ? " *" : ""}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
          <button className="button button--primary" disabled={busy} onClick={applyMappingAndRevalidate}>Valider la correspondance et vérifier les données</button>
        </Card>
      ) : null}

      {step === 4 && preview ? (
        <Card>
          <div className="section-heading"><div><h2>Vérification</h2></div></div>
          <p>
            <Badge tone="success">{preview.validRowCount} valide(s)</Badge>{" "}
            <Badge tone="warning">{preview.warningRowCount} avertissement(s)</Badge>{" "}
            <Badge tone="danger">{preview.errorRowCount} erreur(s)</Badge>
          </p>
          {preview.quotaConflict ? (
            <p className="form-error" role="alert">
              Votre fichier nécessite {preview.quotaConflict.requested} {preview.quotaConflict.resource === "property" ? "biens" : "logements"}, votre offre {preview.quotaConflict.plan} en autorise {preview.quotaConflict.quota}. <a href="/app/billing">Voir les offres</a>.
            </p>
          ) : null}
          <div className="page-stack">
            {preview.rows.filter((r) => r.issues.length > 0).map((row) => (
              <div className="list-row" key={row.rowNumber}>
                <div className="list-row__body">
                  <strong>Ligne {row.rowNumber}{row.normalized.tenant.fullName ? ` — ${row.normalized.tenant.fullName}` : ""}</strong>
                  {row.issues.map((issue, i) => <span key={i}>{issue.severity === "error" ? "⚠ " : "· "}{issue.message}</span>)}
                </div>
                <div className="list-row__trailing">
                  <label><input type="checkbox" checked={skippedRows.has(row.rowNumber)} disabled={row.issues.some((i) => i.severity === "error")} onChange={() => toggleSkip(row.rowNumber)} /> Ne pas importer cette ligne</label>
                </div>
              </div>
            ))}
            {preview.rows.filter((r) => r.issues.length === 0).length > 0 ? <p className="field-help">{preview.rows.filter((r) => r.issues.length === 0).length} ligne(s) sans aucune remarque.</p> : null}
          </div>
          <button className="button button--primary" disabled={importableRowCount < 1} onClick={() => setStep(5)}>Continuer</button>
        </Card>
      ) : null}

      {step === 5 && preview ? (
        <Card>
          <div className="section-heading"><div><h2>Doublons potentiels</h2></div></div>
          {duplicateRows.length === 0 ? <p className="field-help">Aucun doublon potentiel détecté.</p> : (
            <div className="page-stack">
              {duplicateRows.map((row) => (
                <div className="list-row" key={row.rowNumber}>
                  <div className="list-row__body">
                    <strong>Ligne {row.rowNumber}</strong>
                    {row.duplicates.map((dup, i) => (
                      <span key={i}>
                        {dup.entityType === "property" ? "Bien" : dup.entityType === "unit" ? "Logement" : "Locataire"} ressemblant à &quot;{dup.existingLabel}&quot; déjà existant.{" "}
                        <select
                          defaultValue="associate"
                          onChange={(event) => setResolution(row.rowNumber, dup.entityType, event.target.value as DuplicateResolution, event.target.value === "associate" ? dup.existingId : null)}
                        >
                          <option value="associate">Associer à l&apos;existant</option>
                          <option value="create">Créer quand même comme nouveau</option>
                        </select>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className="button button--primary" onClick={() => setStep(6)}>Continuer vers l&apos;aperçu final</button>
        </Card>
      ) : null}

      {step === 6 && preview ? (
        <Card>
          <div className="section-heading"><div><h2>Aperçu final</h2></div></div>
          <p>{importableRowCount} ligne(s) seront importées sur {preview.totalRows}. Aucune donnée n&apos;a encore été enregistrée.</p>
          <p className="field-help">Un mouvement d&apos;ouverture (jamais un faux paiement) sera créé pour chaque bail ayant une dette, un crédit ou un dépôt déjà partiellement payé.</p>
          <button className="button button--primary" disabled={busy} onClick={handleCommit}>Confirmer l&apos;import</button>
        </Card>
      ) : null}

      {step === 7 && commitResult ? (
        <Card>
          <div className="section-heading"><div><h2>{commitResult.alreadyImported ? "Ce fichier a déjà été importé" : "Import terminé"}</h2></div></div>
          {!commitResult.alreadyImported ? (
            <ul>
              <li>Biens créés : {commitResult.createdProperties} · associés à l&apos;existant : {commitResult.matchedProperties}</li>
              <li>Logements créés : {commitResult.createdUnits} · associés à l&apos;existant : {commitResult.matchedUnits}</li>
              <li>Locataires créés : {commitResult.createdTenants} · associés à l&apos;existant : {commitResult.matchedTenants}</li>
              <li>Baux créés : {commitResult.createdLeases}</li>
              <li>Lignes ignorées : {commitResult.skippedRows}</li>
            </ul>
          ) : (
            <p>Ce fichier avait déjà été importé précédemment : aucune donnée n&apos;a été dupliquée.</p>
          )}
          <button className="button button--secondary" onClick={() => { setStep(1); setFile(null); setPreview(null); setCommitResult(null); setSkippedRows(new Set()); setResolutions(new Map()); }}>Importer un autre fichier</button>
        </Card>
      ) : null}
    </div>
  );
}

function stepTitle(step: StepKey): string {
  switch (step) {
    case 1: return "Importer le fichier";
    case 2: return "Contenu détecté";
    case 3: return "Correspondance des colonnes";
    case 4: return "Vérification";
    case 5: return "Doublons potentiels";
    case 6: return "Aperçu final";
    case 7: return "Import";
  }
}
