"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft, Building2, CalendarDays, ChevronRight, FileText, History,
  Home, ImageIcon, KeyRound, Mail, Pencil, Phone, Plus, Search, UserRound, UserRoundPlus,
} from "lucide-react";
import { usePreferences } from "@/core/preferences/preferences-provider";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/ui";
import {
  calendarEntryProration,
  calendarExitProration,
  filterTenants,
  type BillingFrequency,
  type LeaseInput,
  type LeaseOptions,
  type LeaseStatus,
  type LeaseSummary,
  type ProrationMode,
  type TenantDetail,
  type TenantSummary,
} from "@/modules/tenancy/model";

function useCopy() {
  const { language } = usePreferences();
  return (fr: string, en: string) => language === "FR" ? fr : en;
}

function LiveDataNotice() {
  const t = useCopy();
  return <div className="live-data-notice" role="note"><span aria-hidden="true" />{t("Données réelles de l’Organization active", "Live data from the active Organization")}</div>;
}

function money(value: number) {
  return `${value.toLocaleString("fr-FR")} XAF`;
}

function frequencyLabel(value: BillingFrequency, t: ReturnType<typeof useCopy>) {
  return { monthly: t("Mensuelle", "Monthly"), quarterly: t("Trimestrielle", "Quarterly"), semiannual: t("Semestrielle", "Semiannual"), annual: t("Annuelle", "Annual") }[value];
}

function statusBadge(status: LeaseStatus, t: ReturnType<typeof useCopy>) {
  if (status === "active") return <Badge tone="success">{t("Actif", "Active")}</Badge>;
  if (status === "ended") return <Badge tone="neutral">{t("Terminé", "Ended")}</Badge>;
  return <Badge tone="warning">{t("Brouillon", "Draft")}</Badge>;
}

function friendlyError(code: string | undefined, t: ReturnType<typeof useCopy>) {
  if (code === "tenant_contact_required") return t("Ajoutez au moins un téléphone ou un email.", "Add at least a phone number or email.");
  if (code === "identity_pair_required") return t("Le type et le numéro de pièce vont ensemble.", "ID type and number must be provided together.");
  if (code === "lease_period_overlap") return t("Activation refusée : cette unité est occupée sur tout ou partie de cette période.", "Activation refused: this unit is occupied during all or part of this period.");
  if (code === "proration_override_reason_required") return t("Toute correction de prorata exige un motif.", "Every proration override requires a reason.");
  if (code === "forbidden") return t("Vous n’avez plus la permission d’effectuer cette action.", "You no longer have permission to perform this action.");
  if (code?.startsWith("invalid_")) return t("Vérifiez les informations saisies.", "Check the information you entered.");
  if (code === "business_rule_rejected") return t("La règle métier refuse cette modification.", "A business rule rejected this change.");
  return t("L’enregistrement n’a pas abouti. Aucune donnée n’a été modifiée.", "Saving failed. No data was changed.");
}

async function mutate(payload: Record<string, unknown>) {
  const response = await fetch("/api/tenancy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, body };
}

function TenantFields({ tenant }: { tenant?: TenantDetail }) {
  const t = useCopy();
  return <>
    <label className="field"><span>{t("Nom complet", "Full name")}</span><input defaultValue={tenant?.fullName ?? ""} maxLength={160} minLength={2} name="fullName" required /></label>
    <div className="form-grid">
      <label className="field"><span>{t("Téléphone", "Phone")}</span><input defaultValue={tenant?.phone ?? ""} maxLength={32} name="phone" inputMode="tel" placeholder="+237…" /></label>
      <label className="field"><span>Email</span><input defaultValue={tenant?.email ?? ""} maxLength={320} name="email" type="email" /></label>
      <label className="field"><span>{t("Langue préférée", "Preferred language")}</span><select defaultValue={tenant?.preferredLanguage ?? ""} name="preferredLanguage"><option value="">{t("Non précisée", "Not specified")}</option><option value="fr">Français</option><option value="en">English</option></select></label>
      <label className="field"><span>{t("Profession (facultatif)", "Profession (optional)")}</span><input defaultValue={tenant?.profession ?? ""} maxLength={120} name="profession" /></label>
      <label className="field"><span>{t("Type de pièce", "ID type")}</span><select defaultValue={tenant?.identityDocumentType ?? ""} name="identityDocumentType"><option value="">{t("Aucune", "None")}</option><option value="cni">CNI</option><option value="passport">{t("Passeport", "Passport")}</option><option value="other">{t("Autre", "Other")}</option></select></label>
      <label className="field"><span>{t("Numéro de pièce", "ID number")}</span><input defaultValue={tenant?.identityDocumentNumber ?? ""} maxLength={80} name="identityDocumentNumber" /></label>
      <label className="field"><span>{t("Expiration de la pièce", "ID expiry")}</span><input defaultValue={tenant?.identityDocumentExpiresOn ?? ""} name="identityDocumentExpiresOn" type="date" /></label>
    </div>
    <label className="field"><span>{t("Notes internes", "Internal notes")}</span><textarea defaultValue={tenant?.internalNotes ?? ""} maxLength={4000} name="internalNotes" rows={4} /></label>
    <p className="demo-hint">{t("Téléphone ou email : au moins un est obligatoire. La photo et le scan de pièce restent hors Lot 6B.", "Phone or email: at least one is required. Photo and ID scan remain outside Lot 6B.")}</p>
  </>;
}

function tenantPayload(form: FormData) {
  return {
    fullName: form.get("fullName"), phone: form.get("phone"), email: form.get("email"),
    preferredLanguage: form.get("preferredLanguage"), profession: form.get("profession"),
    identityDocumentType: form.get("identityDocumentType"), identityDocumentNumber: form.get("identityDocumentNumber"),
    identityDocumentExpiresOn: form.get("identityDocumentExpiresOn"), internalNotes: form.get("internalNotes"),
  };
}

export function TenantsView({ tenants, canManage }: { tenants: TenantSummary[]; canManage: boolean }) {
  const t = useCopy();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => filterTenants(tenants, query), [tenants, query]);
  return <div className="page-stack">
    <PageHeader eyebrow={t("Relations locatives", "Tenancy")} title={t("Locataires", "Tenants")} description={t("Dossiers réels liés à l’Organization active, sans accès portail automatique.", "Live records linked to the active Organization, without automatic portal access.")} action={canManage ? <Link className="button button--primary" href="/app/locataires/nouveau"><UserRoundPlus size={17} />{t("Ajouter", "Add")}</Link> : undefined} />
    <LiveDataNotice />
    <label className="demo-search"><Search size={18} /><span className="sr-only">{t("Rechercher", "Search")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Nom, téléphone ou email", "Name, phone or email")} /></label>
    {filtered.length ? <div className="demo-card-grid">{filtered.map((tenant) => <Link className="demo-resource-card" href={`/app/locataires/${tenant.id}`} key={tenant.id}><span className="demo-resource-card__icon"><UserRound size={22} /></span><div><h2>{tenant.fullName}</h2><p>{tenant.phone ?? tenant.email}</p><div className="demo-meta"><span>{tenant.currentLease ? `${tenant.currentLease.propertyName} · ${tenant.currentLease.unitLabel}` : t("Aucun bail actif", "No active lease")}</span></div></div><ChevronRight size={20} /></Link>)}</div> : <Card><EmptyState icon={UserRound} title={query ? t("Aucun résultat", "No results") : t("Aucun locataire", "No tenants")} description={query ? t("Modifiez la recherche.", "Change your search.") : t("Ajoutez le premier dossier locataire.", "Add the first tenant record.")} action={canManage && !query ? <Link className="button button--primary" href="/app/locataires/nouveau">{t("Ajouter un locataire", "Add tenant")}</Link> : undefined} /></Card>}
  </div>;
}

export function TenantCreateForm() {
  const t = useCopy(); const router = useRouter();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setMessage(null); const result = await mutate({ action: "create_tenant", ...tenantPayload(new FormData(event.currentTarget)) }); setBusy(false); if (!result.ok || typeof result.body.tenantId !== "string") return setMessage(friendlyError(result.body.error as string | undefined, t)); router.push(`/app/locataires/${result.body.tenantId}`); router.refresh(); }
  return <div className="page-stack demo-narrow"><Link className="demo-back" href="/app/locataires"><ArrowLeft size={17} />{t("Tous les locataires", "All tenants")}</Link><PageHeader eyebrow="SCR-TEN-02" title={t("Ajouter un locataire", "Add tenant")} description={t("Créez le dossier métier uniquement. Aucun compte portail n’est créé.", "Create the business record only. No portal account is created.")} /><LiveDataNotice /><Card><form className="form-stack" onSubmit={submit}><TenantFields /><button className="button button--primary" disabled={busy} type="submit">{busy ? t("Création…", "Creating…") : t("Créer le dossier", "Create record")}</button>{message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}</form></Card></div>;
}

export function TenantDetailView({ tenant, canManage }: { tenant: TenantDetail; canManage: boolean }) {
  const t = useCopy(); const router = useRouter();
  const [editing, setEditing] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const current = tenant.leases.find((lease) => lease.status === "active") ?? null;
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const result = await mutate({ action: "update_tenant", tenantId: tenant.id, ...tenantPayload(new FormData(event.currentTarget)) }); setBusy(false); if (!result.ok) return setMessage(friendlyError(result.body.error as string | undefined, t)); setEditing(false); setMessage(t("Dossier modifié.", "Record updated.")); router.refresh(); }
  return <div className="page-stack"><Link className="demo-back" href="/app/locataires"><ArrowLeft size={17} />{t("Tous les locataires", "All tenants")}</Link><PageHeader eyebrow="SCR-TEN-03" title={tenant.fullName} description={tenant.profession ?? t("Dossier locataire", "Tenant record")} action={canManage ? <button className="button button--secondary" onClick={() => setEditing((value) => !value)} type="button"><Pencil size={17} />{t("Modifier", "Edit")}</button> : undefined} /><LiveDataNotice />{message ? <p className="form-feedback" role="status">{message}</p> : null}
    {editing ? <Card><form className="form-stack" onSubmit={submit}><TenantFields tenant={tenant} /><div className="demo-form-actions"><button className="button button--primary" disabled={busy} type="submit">{t("Enregistrer", "Save")}</button><button className="button button--secondary" onClick={() => setEditing(false)} type="button">{t("Annuler", "Cancel")}</button></div></form></Card> : null}
    <section className="property-photo-placeholder"><ImageIcon size={25} /><div><strong>{t("Photo locataire facultative", "Optional tenant photo")}</strong><span>{t("Placeholder uniquement — aucun fichier Storage au Lot 6B.", "Placeholder only — no Storage file in Lot 6B.")}</span></div></section>
    <div className="content-grid"><Card><div className="section-heading"><div><p className="eyebrow">{t("Profil", "Profile")}</p><h2>{t("Coordonnées", "Contact")}</h2></div><UserRound size={21} /></div><div className="tenancy-contact-list"><span><Phone size={16} />{tenant.phone ?? "—"}</span><span><Mail size={16} />{tenant.email ?? "—"}</span><span>{t("Langue", "Language")} : {tenant.preferredLanguage?.toUpperCase() ?? "—"}</span>{canManage && tenant.identityDocumentType ? <span>{tenant.identityDocumentType.toUpperCase()} · {tenant.identityDocumentNumber}</span> : null}</div></Card>
      <Card><div className="section-heading"><div><p className="eyebrow">{t("Location actuelle", "Current lease")}</p><h2>{current ? current.unitLabel : t("Aucun bail actif", "No active lease")}</h2></div><KeyRound size={21} /></div>{current ? <><p>{current.propertyName}</p><Link className="button button--secondary" href={`/app/locations/${current.id}`}>{t("Ouvrir la location", "Open lease")}</Link></> : canManage ? <Link className="button button--primary" href={`/app/locations/nouveau?tenant=${tenant.id}`}>{t("Créer une location", "Create lease")}</Link> : null}</Card>
    </div>
    <Card><div className="section-heading"><div><p className="eyebrow">{t("Historique", "History")}</p><h2>{t("Locations", "Leases")}</h2></div><History size={21} /></div>{tenant.leases.length ? <div className="demo-list">{tenant.leases.map((lease) => <Link className="demo-list-row" href={`/app/locations/${lease.id}`} key={lease.id}><span className="demo-list-row__icon"><Home size={19} /></span><div><strong>{lease.propertyName} · {lease.unitLabel}</strong><span>{lease.startDate}{lease.endDate ? ` → ${lease.endDate}` : ""}</span></div>{statusBadge(lease.status, t)}<ChevronRight size={18} /></Link>)}</div> : <EmptyState title={t("Aucune location", "No leases")} description={t("Le dossier est prêt à être relié à une Unit.", "The record is ready to be linked to a Unit.")} />}</Card>
    <div className="tenancy-placeholder-grid"><Card muted><FileText size={20} /><strong>{t("Paiements", "Payments")}</strong><span>{t("Prévu au Lot 6C2", "Planned for Lot 6C2")}</span></Card><Card muted><FileText size={20} /><strong>{t("Documents", "Documents")}</strong><span>{t("Prévu au Lot 6C3", "Planned for Lot 6C3")}</span></Card></div>
  </div>;
}

export function LeasesView({ leases, canManage }: { leases: LeaseSummary[]; canManage: boolean }) {
  const t = useCopy(); const [query, setQuery] = useState("");
  const filtered = leases.filter((lease) => `${lease.tenantName} ${lease.propertyName} ${lease.unitLabel}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="page-stack"><PageHeader eyebrow={t("Cycle locatif", "Lease lifecycle")} title={t("Locations", "Leases")} description={t("Brouillons, locations actives et historique — sans solde financier fictif.", "Drafts, active leases and history — without fake financial balances.")} action={canManage ? <Link className="button button--primary" href="/app/locations/nouveau"><Plus size={17} />{t("Nouvelle location", "New lease")}</Link> : undefined} /><LiveDataNotice /><label className="demo-search"><Search size={18} /><span className="sr-only">{t("Rechercher", "Search")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Bien, unité ou locataire", "Property, unit or tenant")} /></label>
    {filtered.length ? <div className="demo-card-grid">{filtered.map((lease) => <Link className="demo-resource-card" href={`/app/locations/${lease.id}`} key={lease.id}><span className="demo-resource-card__icon"><KeyRound size={22} /></span><div><div className="tenancy-card-heading"><h2>{lease.propertyName} · {lease.unitLabel}</h2>{statusBadge(lease.status, t)}</div><p>{lease.tenantName}</p><div className="demo-meta"><span>{money(lease.baseRentXaf)} + {money(lease.recurringChargesXaf)}</span><span>{frequencyLabel(lease.billingFrequency, t)}</span><span>{lease.startDate}{lease.endDate ? ` → ${lease.endDate}` : ""}</span></div></div><ChevronRight size={20} /></Link>)}</div> : <Card><EmptyState icon={KeyRound} title={query ? t("Aucun résultat", "No results") : t("Aucune location", "No leases")} description={query ? t("Modifiez la recherche.", "Change your search.") : t("Créez le premier brouillon de location.", "Create the first lease draft.")} action={canManage && !query ? <Link className="button button--primary" href="/app/locations/nouveau">{t("Créer une location", "Create lease")}</Link> : undefined} /></Card>}
  </div>;
}

type LeaseDraft = LeaseInput;
const blankLease = (options: LeaseOptions, tenantId?: string, unitId?: string): LeaseDraft => {
  const selectedUnit = options.units.find((unit) => unit.id === unitId && !unit.occupied) ?? options.units.find((unit) => !unit.occupied);
  return { tenantId: options.tenants.find((tenant) => tenant.id === tenantId)?.id ?? options.tenants[0]?.id ?? "", propertyId: selectedUnit?.propertyId ?? "", unitId: selectedUnit?.id ?? "", startDate: new Date().toISOString().slice(0, 10), endDate: null, baseRentXaf: 0, recurringChargesXaf: 0, securityDepositXaf: 0, initialPrepaymentPeriods: 0, initialPrepaymentAmountXaf: 0, billingFrequency: "monthly", dueDay: 5, generateDueDaysBefore: 5, overdueReminderDaysAfter: 1, entryProrationMode: "none", exitProrationMode: "none", entryProrationOverrideXaf: null, entryProrationOverrideReason: null, exitProrationOverrideXaf: null, exitProrationOverrideReason: null };
};

function LeaseFields({ value, options, onChange }: { value: LeaseDraft; options: LeaseOptions; onChange: (next: LeaseDraft) => void }) {
  const t = useCopy(); const total = value.baseRentXaf + value.recurringChargesXaf;
  const entryCalculated = value.startDate ? calendarEntryProration(total, value.startDate, value.entryProrationMode) : total;
  const groups = new Map<string, LeaseOptions["units"]>();
  for (const unit of options.units) groups.set(unit.propertyName, [...(groups.get(unit.propertyName) ?? []), unit]);
  function set<K extends keyof LeaseDraft>(key: K, next: LeaseDraft[K]) { const changed = { ...value, [key]: next }; if (key === "unitId") changed.propertyId = options.units.find((unit) => unit.id === next)?.propertyId ?? ""; onChange(changed); }
  return <>
    <div className="form-grid"><label className="field"><span>{t("Locataire", "Tenant")}</span><select value={value.tenantId} onChange={(event) => set("tenantId", event.target.value)} required>{options.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.fullName}</option>)}</select></label>
      <label className="field"><span>{t("Unité", "Unit")}</span><select value={value.unitId} onChange={(event) => set("unitId", event.target.value)} required>{[...groups].map(([propertyName, units]) => <optgroup label={propertyName} key={propertyName}>{units.map((unit) => <option disabled={unit.occupied} key={unit.id} value={unit.id}>{unit.label}{unit.occupied ? ` — ${t("occupée", "occupied")}` : ` — ${t("vacante", "vacant")}`}</option>)}</optgroup>)}</select></label>
      <label className="field"><span>{t("Début", "Start")}</span><input type="date" value={value.startDate} onChange={(event) => set("startDate", event.target.value)} required /></label><label className="field"><span>{t("Fin prévue (facultative)", "Planned end (optional)")}</span><input type="date" value={value.endDate ?? ""} onChange={(event) => set("endDate", event.target.value || null)} /></label>
      <label className="field"><span>{t("Loyer hors charges (XAF)", "Base rent (XAF)")}</span><input min="1" type="number" value={value.baseRentXaf || ""} onChange={(event) => set("baseRentXaf", Number(event.target.value))} required /></label><label className="field"><span>{t("Charges récurrentes (XAF)", "Recurring charges (XAF)")}</span><input min="0" type="number" value={value.recurringChargesXaf} onChange={(event) => set("recurringChargesXaf", Number(event.target.value))} /></label>
      <label className="field"><span>{t("Dépôt de garantie (XAF)", "Security deposit (XAF)")}</span><input min="0" type="number" value={value.securityDepositXaf} onChange={(event) => set("securityDepositXaf", Number(event.target.value))} /></label><label className="field"><span>{t("Avance initiale (XAF)", "Initial prepayment (XAF)")}</span><input min="0" type="number" value={value.initialPrepaymentAmountXaf} onChange={(event) => set("initialPrepaymentAmountXaf", Number(event.target.value))} /></label>
      <label className="field"><span>{t("Nombre de périodes prépayées", "Prepaid periods")}</span><input min="0" step="0.01" type="number" value={value.initialPrepaymentPeriods} onChange={(event) => set("initialPrepaymentPeriods", Number(event.target.value))} /></label><label className="field"><span>{t("Périodicité", "Frequency")}</span><select value={value.billingFrequency} onChange={(event) => set("billingFrequency", event.target.value as BillingFrequency)}><option value="monthly">{t("Mensuelle", "Monthly")}</option><option value="quarterly">{t("Trimestrielle", "Quarterly")}</option><option value="semiannual">{t("Semestrielle", "Semiannual")}</option><option value="annual">{t("Annuelle", "Annual")}</option></select></label>
      <label className="field"><span>{t("Jour d’exigibilité", "Due day")}</span><input min="1" max="31" type="number" value={value.dueDay} onChange={(event) => set("dueDay", Number(event.target.value))} /></label><label className="field"><span>{t("Générer l’appel J-X", "Generate due J-X")}</span><input min="0" max="90" type="number" value={value.generateDueDaysBefore} onChange={(event) => set("generateDueDaysBefore", Number(event.target.value))} /></label>
      <label className="field"><span>{t("Rappel de retard J+X", "Overdue reminder J+X")}</span><input min="1" max="90" type="number" value={value.overdueReminderDaysAfter} onChange={(event) => set("overdueReminderDaysAfter", Number(event.target.value))} /></label><label className="field"><span>{t("Prorata d’entrée", "Entry proration")}</span><select value={value.entryProrationMode} onChange={(event) => set("entryProrationMode", event.target.value as ProrationMode)}><option value="none">{t("Aucun", "None")}</option><option value="calendar_days">{t("Jours calendaires", "Calendar days")}</option></select></label>
      <label className="field"><span>{t("Prorata de sortie", "Exit proration")}</span><select value={value.exitProrationMode} onChange={(event) => set("exitProrationMode", event.target.value as ProrationMode)}><option value="none">{t("Aucun", "None")}</option><option value="calendar_days">{t("Jours calendaires", "Calendar days")}</option></select></label>
    </div>
    <Card muted className="tenancy-calculation"><span>{t("Total périodique dérivé", "Derived periodic total")}</span><strong className="financial-value">{money(total)}</strong><small>{t(`Prorata d’entrée calculé : ${money(entryCalculated)}`, `Calculated entry proration: ${money(entryCalculated)}`)}</small></Card>
    <details className="tenancy-override"><summary>{t("Correction manuelle du prorata (facultative)", "Manual proration override (optional)")}</summary><div className="form-grid"><label className="field"><span>{t("Montant d’entrée corrigé", "Entry override amount")}</span><input min="0" type="number" value={value.entryProrationOverrideXaf ?? ""} onChange={(event) => set("entryProrationOverrideXaf", event.target.value ? Number(event.target.value) : null)} /></label><label className="field"><span>{t("Motif obligatoire", "Required reason")}</span><input maxLength={500} value={value.entryProrationOverrideReason ?? ""} onChange={(event) => set("entryProrationOverrideReason", event.target.value || null)} /></label></div></details>
  </>;
}

export function LeaseCreateForm({ options, initialTenantId, initialUnitId }: { options: LeaseOptions; initialTenantId?: string; initialUnitId?: string }) {
  const t = useCopy(); const router = useRouter(); const [draft, setDraft] = useState(() => blankLease(options, initialTenantId, initialUnitId)); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setMessage(null); const result = await mutate({ action: "create_lease", ...draft }); setBusy(false); if (!result.ok || typeof result.body.leaseId !== "string") return setMessage(friendlyError(result.body.error as string | undefined, t)); router.push(`/app/locations/${result.body.leaseId}`); router.refresh(); }
  if (!options.tenants.length || !options.units.some((unit) => !unit.occupied)) return <div className="page-stack"><Card><EmptyState icon={KeyRound} title={t("Préconditions manquantes", "Missing prerequisites")} description={t("Ajoutez un locataire et conservez au moins une unité vacante avant de créer une location.", "Add a tenant and keep at least one unit vacant before creating a lease.")} action={<Link className="button button--primary" href={!options.tenants.length ? "/app/locataires/nouveau" : "/app/biens"}>{t("Continuer", "Continue")}</Link>} /></Card></div>;
  return <div className="page-stack demo-narrow"><Link className="demo-back" href="/app/locations"><ArrowLeft size={17} />{t("Toutes les locations", "All leases")}</Link><PageHeader eyebrow="SCR-LEASE-02" title={t("Créer un brouillon", "Create a draft")} description={t("Les montants sont préparés sans générer d’échéance, ledger ou paiement.", "Amounts are prepared without generating dues, ledger entries or payments.")} /><LiveDataNotice /><Card><form className="form-stack" onSubmit={submit}><LeaseFields value={draft} options={options} onChange={setDraft} /><button className="button button--primary" disabled={busy} type="submit">{busy ? t("Enregistrement…", "Saving…") : t("Enregistrer le brouillon", "Save draft")}</button>{message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}</form></Card></div>;
}

export function LeaseDetailView({ lease, options, canManage }: { lease: LeaseSummary; options: LeaseOptions; canManage: boolean }) {
  const t = useCopy(); const router = useRouter(); const [editing, setEditing] = useState(false); const [draft, setDraft] = useState<LeaseDraft>(lease); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null); const [endedOn, setEndedOn] = useState(new Date().toISOString().slice(0, 10));
  const entryProration = lease.entryProrationOverrideXaf ?? calendarEntryProration(lease.periodicTotalXaf, lease.startDate, lease.entryProrationMode);
  async function update(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const result = await mutate({ action: "update_lease", leaseId: lease.id, ...draft }); setBusy(false); if (!result.ok) return setMessage(friendlyError(result.body.error as string | undefined, t)); setEditing(false); setMessage(t("Brouillon modifié.", "Draft updated.")); router.refresh(); }
  async function activate() { if (!window.confirm(t("Activer cette location ? L’unité deviendra occupée et les conditions seront figées.", "Activate this lease? The unit will become occupied and terms will be locked."))) return; setBusy(true); const result = await mutate({ action: "activate_lease", leaseId: lease.id }); setBusy(false); if (!result.ok) return setMessage(friendlyError(result.body.error as string | undefined, t)); router.refresh(); }
  async function endLease() { if (!window.confirm(t("Terminer cette location et libérer l’unité ?", "End this lease and free the unit?"))) return; setBusy(true); const result = await mutate({ action: "end_lease", leaseId: lease.id, endedOn }); setBusy(false); if (!result.ok) return setMessage(friendlyError(result.body.error as string | undefined, t)); router.refresh(); }
  return <div className="page-stack"><Link className="demo-back" href="/app/locations"><ArrowLeft size={17} />{t("Toutes les locations", "All leases")}</Link><PageHeader eyebrow="SCR-LEASE-04" title={`${lease.propertyName} · ${lease.unitLabel}`} description={lease.tenantName} action={canManage && lease.status === "draft" ? <button className="button button--secondary" onClick={() => setEditing((value) => !value)} type="button"><Pencil size={17} />{t("Modifier", "Edit")}</button> : undefined} /><LiveDataNotice />{message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}
    {editing ? <Card><form className="form-stack" onSubmit={update}><LeaseFields value={draft} options={options} onChange={setDraft} /><div className="demo-form-actions"><button className="button button--primary" disabled={busy} type="submit">{t("Enregistrer", "Save")}</button><button className="button button--secondary" onClick={() => setEditing(false)} type="button">{t("Annuler", "Cancel")}</button></div></form></Card> : null}
    <nav className="tenancy-tabs" aria-label={t("Sections de la location", "Lease sections")}><a aria-current="page" href="#informations">{t("Informations", "Information")}</a><span>{t("Échéances · 6C1", "Dues · 6C1")}</span><span>{t("Paiements · 6C2", "Payments · 6C2")}</span><span>{t("Documents · 6C3", "Documents · 6C3")}</span><span>{t("Activité", "Activity")}</span></nav>
    <Card className="demo-lease-summary" id="informations"><div className="tenancy-card-heading">{statusBadge(lease.status, t)}<span>{frequencyLabel(lease.billingFrequency, t)}</span></div><div className="tenancy-links"><Link href={`/app/locataires/${lease.tenantId}`}><UserRound size={16} />{lease.tenantName}</Link><Link href={`/app/biens/${lease.propertyId}`}><Building2 size={16} />{lease.propertyName}</Link><Link href={`/app/biens/${lease.propertyId}/unites/${lease.unitId}`}><Home size={16} />{lease.unitLabel}</Link></div><dl><div><dt>{t("Loyer hors charges", "Base rent")}</dt><dd>{money(lease.baseRentXaf)}</dd></div><div><dt>{t("Charges", "Charges")}</dt><dd>{money(lease.recurringChargesXaf)}</dd></div><div><dt>{t("Total périodique", "Periodic total")}</dt><dd className="financial-value">{money(lease.periodicTotalXaf)}</dd></div><div><dt>{t("Dépôt de garantie", "Security deposit")}</dt><dd>{money(lease.securityDepositXaf)}</dd></div><div><dt>{t("Avance initiale", "Initial prepayment")}</dt><dd>{money(lease.initialPrepaymentAmountXaf)} · {lease.initialPrepaymentPeriods} {t("période(s)", "period(s)")}</dd></div><div><dt>{t("Période", "Period")}</dt><dd>{lease.startDate}{lease.endDate ? ` → ${lease.endDate}` : " → —"}</dd></div><div><dt>{t("Exigibilité", "Due")}</dt><dd>J{lease.dueDay} · {t(`appel J-${lease.generateDueDaysBefore}`, `generate J-${lease.generateDueDaysBefore}`)}</dd></div><div><dt>{t("Prorata d’entrée", "Entry proration")}</dt><dd>{money(entryProration)}{lease.entryProrationOverrideXaf !== null ? ` · ${t("corrigé", "overridden")}` : ""}</dd></div>{lease.endedOn ? <div><dt>{t("Sortie", "Exit")}</dt><dd>{lease.endedOn} · {money(lease.exitProrationOverrideXaf ?? calendarExitProration(lease.periodicTotalXaf, lease.endedOn, lease.exitProrationMode))}</dd></div> : null}</dl>
      {canManage && lease.status === "draft" ? <div className="tenancy-sensitive-action"><p>{t("L’activation rend l’unité occupée et fige les conditions. Le chevauchement est revérifié par PostgreSQL.", "Activation marks the unit occupied and locks terms. PostgreSQL rechecks overlap.")}</p><button className="button button--primary" disabled={busy} onClick={activate} type="button">{t("Activer la location", "Activate lease")}</button></div> : null}
      {canManage && lease.status === "active" ? <div className="tenancy-sensitive-action"><label className="field"><span>{t("Date de sortie effective", "Effective end date")}</span><input min={lease.startDate} type="date" value={endedOn} onChange={(event) => setEndedOn(event.target.value)} /></label><button className="button button--secondary" disabled={busy} onClick={endLease} type="button">{t("Terminer et libérer l’unité", "End and free unit")}</button></div> : null}
    </Card>
    <div className="tenancy-placeholder-grid"><Card muted><CalendarDays size={20} /><strong>{t("Échéances + Ledger", "Dues + Ledger")}</strong><span>{t("Placeholder 6C1", "6C1 placeholder")}</span></Card><Card muted><FileText size={20} /><strong>{t("Paiements", "Payments")}</strong><span>{t("Placeholder 6C2", "6C2 placeholder")}</span></Card><Card muted><FileText size={20} /><strong>{t("Documents", "Documents")}</strong><span>{t("Placeholder 6C3", "6C3 placeholder")}</span></Card></div>
  </div>;
}

export function MissingTenancyResource({ leases = false }: { leases?: boolean }) {
  const t = useCopy(); const href = leases ? "/app/locations" : "/app/locataires";
  return <div className="page-stack"><Card><EmptyState title={t("Ressource introuvable ou inaccessible", "Resource not found or unavailable")} description={t("Vérifiez l’Organization active ou revenez à la liste.", "Check the active Organization or return to the list.")} action={<Link className="button button--primary" href={href}>{t("Retour à la liste", "Back to list")}</Link>} /></Card></div>;
}
