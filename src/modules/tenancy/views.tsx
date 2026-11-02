"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft, Building2, ChevronRight, CircleAlert,
  History, Home, KeyRound, LayoutGrid, List,
  Mail, Pencil, Phone, Plus, Search, ShieldCheck, StickyNote, UserRound,
  UserRoundPlus, X,
} from "lucide-react";
import { usePreferences } from "@/core/preferences/preferences-provider";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/ui";
import type { LeaseFinancialDetail, TenantFinancialDetail, TenantFinancialPosition } from "@/modules/finance/model";
import { LeaseDuesPanel, TenantFinancialSummary } from "@/modules/finance/views";
import { PaymentHistoryPanel } from "@/modules/payments/views";
import type { PaymentSummary } from "@/modules/payments/model";
import type { FinancialDocumentSummary } from "@/modules/documents/model";
import { FinancialDocumentsPanel } from "@/modules/documents/views";
import { TenantPortalAccessManagement } from "@/tenant-portal/access-management";
import type { PortalAccessStatus } from "@/tenant-portal/model";
import { TenantWhatsAppPreferencesForm } from "@/modules/tenancy/tenant-whatsapp-preferences";
import {
  calendarEntryProration,
  calendarEntryProrationDetail,
  calendarExitProration,
  DUE_NOTICE_DAYS,
  filterTenants,
  prepaymentCoverage,
  TENANT_CIVILITIES,
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
  return <div className="live-data-notice" role="note"><span aria-hidden="true" />{t("Données réelles de l’organisation active", "Live data from the active Organization")}</div>;
}

function money(value: number) {
  return `${value.toLocaleString("fr-FR")} XAF`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function frequencyLabel(value: BillingFrequency, t: ReturnType<typeof useCopy>) {
  return { monthly: t("Mensuelle", "Monthly"), quarterly: t("Trimestrielle", "Quarterly"), semiannual: t("Semestrielle", "Semiannual"), annual: t("Annuelle", "Annual") }[value];
}

function shortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function longDate(value: string, language: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(language === "FR" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function periodicAmountLabel(frequency: BillingFrequency, t: ReturnType<typeof useCopy>) {
  return frequency === "monthly" ? t("Montant mensuel total", "Total monthly amount") : t("Total périodique", "Periodic total");
}

function naturalDueDay(day: number, frequency: BillingFrequency, t: ReturnType<typeof useCopy>) {
  return frequency === "monthly"
    ? t(`Le ${day} de chaque mois`, `On the ${day} of every month`)
    : t(`Le ${day} du mois d’échéance`, `On day ${day} of the due month`);
}

function prepaymentLabel(fullPeriods: number, remainderXaf: number, frequency: BillingFrequency, t: ReturnType<typeof useCopy>) {
  // Estimation indicative uniquement (division simple montant / loyer périodique).
  // Elle ne présume ni du dépôt de garantie ni du prorata d'entrée : la
  // répartition réelle (dépôt, échéances, crédit) reste un choix explicite
  // fait au moment de l'encaissement — jamais une allocation implicite ici.
  const noun = frequency === "monthly"
    ? (fullPeriods === 1 ? t("mois de loyer, si intégralement affecté au loyer", "rent month, if fully applied to rent") : t("mois de loyer, si intégralement affecté au loyer", "rent months, if fully applied to rent"))
    : ({
        quarterly: t("période(s) trimestrielle(s), si intégralement affecté au loyer", "quarterly period(s), if fully applied to rent"),
        semiannual: t("période(s) semestrielle(s), si intégralement affecté au loyer", "semiannual period(s), if fully applied to rent"),
        annual: t("période(s) annuelle(s), si intégralement affecté au loyer", "annual period(s), if fully applied to rent"),
      } as const)[frequency];
  const estimate = `${t("Estimation", "Estimate")} : ${fullPeriods} ${noun}${remainderXaf > 0 ? ` + ${money(remainderXaf)} ${t("restant", "remaining")}` : ""}`;
  return `${estimate} — ${t("la répartition réelle (dépôt, échéances, crédit) sera confirmée lors de l’encaissement.", "the actual split (deposit, dues, credit) will be confirmed when the payment is recorded.")}`;
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
  if (code === "invalid_payment_terms") return t("Les modalités de paiement doivent contenir entre 3 et 1000 caractères.", "Payment terms must be between 3 and 1000 characters.");
  if (code === "tenant_name_pair_required") return t("Le prénom et le nom vont ensemble : complétez les deux ou laissez les deux vides.", "First and last name go together: fill in both or leave both empty.");
  if (code === "invalid_tenant_civility") return t("Civilité non reconnue.", "Unrecognized civility.");
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

function TenantFields({ tenant, autoFocusEmail }: { tenant?: TenantDetail; autoFocusEmail?: boolean }) {
  const t = useCopy();
  const emailRef = useRef<HTMLInputElement>(null);
  const fullNameRef = useRef<HTMLInputElement>(null);
  const [civility, setCivility] = useState(tenant?.civility ?? "");
  const [firstName, setFirstName] = useState(tenant?.firstName ?? "");
  const [lastName, setLastName] = useState(tenant?.lastName ?? "");
  useEffect(() => {
    // Lien profond depuis la modal "Adresse email manquante" (§9) : le champ
    // email doit être visible et prêt à recevoir la saisie sans action
    // supplémentaire de l'utilisateur.
    if (autoFocusEmail) emailRef.current?.focus();
  }, [autoFocusEmail]);
  // CONTRATS-UX-PILOTE-01 — civilité/prénom/nom sont facultatifs et
  // SÉPARÉS du Nom complet, qui reste le seul champ réellement affiché et
  // utilisé par le contrat généré. Quand les deux sont renseignés, on
  // SUGGÈRE un Nom complet composé — uniquement si le champ est encore
  // vide — pour éviter une double saisie sans jamais écraser une valeur
  // existante (donc sans jamais casser l'affichage historique d'un
  // locataire déjà créé).
  function suggestFullName(nextFirstName: string, nextLastName: string, nextCivility: string) {
    if (fullNameRef.current && !fullNameRef.current.value.trim() && nextFirstName.trim() && nextLastName.trim()) {
      fullNameRef.current.value = [nextCivility, nextFirstName.trim(), nextLastName.trim()].filter(Boolean).join(" ");
    }
  }
  return <>
    <div className="form-grid">
      <label className="field"><span>{t("Civilité (facultatif)", "Civility (optional)")}</span><select name="civility" value={civility} onChange={(event) => { setCivility(event.target.value); suggestFullName(firstName, lastName, event.target.value); }}><option value="">{t("Non précisée", "Not specified")}</option>{TENANT_CIVILITIES.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
      <label className="field"><span>{t("Prénom(s) (facultatif)", "First name(s) (optional)")}</span><input maxLength={80} name="firstName" value={firstName} onChange={(event) => { setFirstName(event.target.value); suggestFullName(event.target.value, lastName, civility); }} /></label>
      <label className="field"><span>{t("Nom(s) (facultatif)", "Last name(s) (optional)")}</span><input maxLength={80} name="lastName" value={lastName} onChange={(event) => { setLastName(event.target.value); suggestFullName(firstName, event.target.value, civility); }} /></label>
    </div>
    <label className="field"><span>{t("Nom complet", "Full name")}</span><input defaultValue={tenant?.fullName ?? ""} maxLength={160} minLength={2} name="fullName" ref={fullNameRef} required /><small>{t("Champ affiché partout (listes, contrat généré). La civilité/prénom/nom ci-dessus ne font que le pré-remplir : vous pouvez toujours le corriger vous-même.", "Shown everywhere (lists, generated contract). Civility/first/last name above only prefill it — you can always edit it yourself.")}</small></label>
    <div className="form-grid">
      <label className="field"><span>{t("Téléphone", "Phone")}</span><input defaultValue={tenant?.phone ?? ""} maxLength={32} name="phone" inputMode="tel" placeholder="+237…" /></label>
      <label className="field"><span>Email</span><input defaultValue={tenant?.email ?? ""} maxLength={320} name="email" ref={emailRef} type="email" /></label>
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
    fullName: form.get("fullName"), civility: form.get("civility"), firstName: form.get("firstName"), lastName: form.get("lastName"),
    phone: form.get("phone"), email: form.get("email"),
    preferredLanguage: form.get("preferredLanguage"), profession: form.get("profession"),
    identityDocumentType: form.get("identityDocumentType"), identityDocumentNumber: form.get("identityDocumentNumber"),
    identityDocumentExpiresOn: form.get("identityDocumentExpiresOn"), internalNotes: form.get("internalNotes"),
  };
}

export function TenantsView({ tenants, canManage }: { tenants: TenantSummary[]; canManage: boolean }) {
  const t = useCopy();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => filterTenants(tenants, query), [tenants, query]);
  return <div className="page-stack resource-index-v2 tenancy-index-v2">
    <PageHeader eyebrow={t("Relations locatives", "Tenancy")} title={t("Locataires", "Tenants")} description={t("Dossiers réels liés à l’organisation active, sans accès portail automatique.", "Live records linked to the active Organization, without automatic portal access.")} action={canManage ? <Link className="button button--primary" href="/app/locataires/nouveau"><UserRoundPlus size={17} />{t("Ajouter", "Add")}</Link> : undefined} />
    <LiveDataNotice />
    <label className="demo-search"><Search size={18} /><span className="sr-only">{t("Rechercher", "Search")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Nom, téléphone ou email", "Name, phone or email")} /></label>
    {filtered.length ? <div className="demo-card-grid">{filtered.map((tenant) => <Link className="demo-resource-card" href={`/app/locataires/${tenant.id}`} key={tenant.id}><span className="demo-resource-card__icon"><UserRound size={22} /></span><div><h2>{tenant.fullName}</h2><p>{tenant.phone ?? tenant.email}</p><div className="demo-meta"><span>{tenant.currentLease ? `${tenant.currentLease.propertyName} · ${tenant.currentLease.unitLabel}` : t("Aucun bail actif", "No active lease")}</span></div></div><ChevronRight size={20} /></Link>)}</div> : <Card><EmptyState icon={UserRound} title={query ? t("Aucun résultat", "No results") : t("Aucun locataire", "No tenants")} description={query ? t("Modifiez la recherche.", "Change your search.") : t("Ajoutez le premier dossier locataire.", "Add the first tenant record.")} action={canManage && !query ? <Link className="button button--primary" href="/app/locataires/nouveau">{t("Ajouter un locataire", "Add tenant")}</Link> : undefined} /></Card>}
  </div>;
}

export function TenantCreateForm({ organizationCountry = "CM" }: { organizationCountry?: string }) {
  const t = useCopy(); const router = useRouter();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (createdTenantId) return; setBusy(true); setMessage(null); const result = await mutate({ action: "create_tenant", ...tenantPayload(new FormData(event.currentTarget)) }); setBusy(false); if (!result.ok || typeof result.body.tenantId !== "string") return setMessage(friendlyError(result.body.error as string | undefined, t)); setCreatedTenantId(result.body.tenantId); setMessage(t("Dossier créé. WhatsApp est facultatif ; un échec ci-dessous ne recréera ni ne supprimera ce locataire.", "Record created. WhatsApp is optional; a failure below will neither recreate nor delete this tenant.")); }
  return <div className="page-stack demo-narrow form-page-v2"><Link className="demo-back" href="/app/locataires"><ArrowLeft size={17} />{t("Tous les locataires", "All tenants")}</Link><PageHeader eyebrow={t("Locataires", "Tenants")} title={t("Ajouter un locataire", "Add tenant")} description={t("Créez le dossier métier, puis ajoutez facultativement ses préférences WhatsApp. Aucun compte portail n’est créé.", "Create the business record, then optionally add WhatsApp preferences. No portal account is created.")} /><LiveDataNotice />{!createdTenantId ? <Card><form className="form-stack" onSubmit={submit}><TenantFields /><button className="button button--primary" disabled={busy} type="submit">{busy ? t("Création…", "Creating…") : t("Créer le dossier", "Create record")}</button>{message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}</form></Card> : <><Card><p className="form-feedback" role="status">{message}</p><TenantWhatsAppPreferencesForm initialCountry={organizationCountry} tenantId={createdTenantId} /></Card><div className="form-actions"><button className="button button--secondary" onClick={() => { router.push(`/app/locataires/${createdTenantId}`); router.refresh(); }} type="button">{t("Ignorer ou terminer", "Skip or finish")}</button></div></>}</div>;
}

export function TenantDetailView({ tenant, canManage, financial, payments, canRecordPayment, documents, canShareDocuments, emailDeliveryEnabled, canManagePortal, portalAccess }: { tenant: TenantDetail; canManage: boolean; financial: TenantFinancialDetail | null; payments: PaymentSummary[] | null; canRecordPayment: boolean; documents: FinancialDocumentSummary[] | null; canShareDocuments: boolean; emailDeliveryEnabled: boolean; canManagePortal: boolean; portalAccess: PortalAccessStatus | null }) {
  const t = useCopy();
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusEmail = searchParams.get("focus") === "email";
  const [editing, setEditing] = useState(focusEmail);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const current = tenant.leases.find((lease) => lease.status === "active") ?? null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await mutate({ action: "update_tenant", tenantId: tenant.id, ...tenantPayload(new FormData(event.currentTarget)) });
    setBusy(false);
    if (!result.ok) return setMessage(friendlyError(result.body.error as string | undefined, t));
    setEditing(false);
    setMessage(t("Dossier modifié.", "Record updated."));
    router.refresh();
  }

  return (
    <div className="page-stack tenant-detail-v2">
      <Link className="demo-back" href="/app/locataires"><ArrowLeft size={17} />{t("Tous les locataires", "All tenants")}</Link>
      <section className="tenant-profile-hero">
        <div className="tenant-profile-hero__avatar" aria-label={t("Photo locataire non disponible", "Tenant photo unavailable")}>
          <span>{initials(tenant.fullName)}</span>
          <small>{t("Photo à venir", "Photo coming later")}</small>
        </div>
        <div className="tenant-profile-hero__identity">
          <p className="eyebrow">{t("Dossier locataire", "Tenant record")}</p>
          <h1>{tenant.fullName}</h1>
          <p>{tenant.profession ?? t("Profession non renseignée", "Profession not provided")}</p>
          <div className="tenant-profile-hero__contacts">
            {tenant.phone ? <span><Phone size={15} />{tenant.phone}</span> : null}
            {tenant.email ? <span><Mail size={15} />{tenant.email}</span> : null}
          </div>
        </div>
        <div className="tenant-profile-hero__lease">
          <div>
            <small>{t("Location actuelle", "Current lease")}</small>
            <strong>{current ? current.unitLabel : t("Aucune location active", "No active lease")}</strong>
            <span>{current?.propertyName ?? t("Dossier disponible pour une nouvelle location", "Record ready for a new lease")}</span>
          </div>
          {current ? statusBadge(current.status, t) : <Badge tone="neutral">{t("Sans location", "No lease")}</Badge>}
          {current
            ? <Link className="button button--on-dark" href={`/app/locations/${current.id}`}>{t("Ouvrir la location", "Open lease")}</Link>
            : canManage ? <Link className="button button--accent" href={`/app/locations/nouveau?tenant=${tenant.id}`}>{t("Créer une location", "Create lease")}</Link> : null}
        </div>
        {canManage ? <button className="button button--on-dark tenant-profile-hero__edit" onClick={() => setEditing((value) => !value)} type="button"><Pencil size={17} />{t("Modifier", "Edit")}</button> : null}
      </section>

      <LiveDataNotice />
      {message ? <p className="form-feedback" role="status">{message}</p> : null}
      {editing ? <Card><form className="form-stack" onSubmit={submit}><TenantFields autoFocusEmail={focusEmail} tenant={tenant} /><div className="demo-form-actions"><button className="button button--primary" disabled={busy} type="submit">{t("Enregistrer", "Save")}</button><button className="button button--secondary" onClick={() => setEditing(false)} type="button">{t("Annuler", "Cancel")}</button></div></form></Card> : null}

      <nav className="record-tabs" aria-label={t("Sections du dossier locataire", "Tenant record sections")}>
        <a aria-current="page" href="#profil">{t("Profil", "Profile")}</a>
        <a href="#location-actuelle">{t("Location actuelle", "Current lease")}</a>
        <a href="#historique">{t("Historique", "History")}</a>
        {payments ? <a href="#paiements">{t("Paiements", "Payments")}</a> : null}
        {documents ? <a href="#documents">{t("Documents", "Documents")}</a> : null}
        {canManagePortal ? <a href="#portail">{t("Portail", "Portal")}</a> : null}
        <a href="#notes">{t("Notes", "Notes")}</a>
      </nav>

      {financial ? <TenantFinancialSummary tenantId={tenant.id} financial={financial} /> : null}
      {financial ? <LeaseDuesPanel financial={financial} tenantScope /> : null}

      <div className="tenant-record-grid">
        <Card id="profil" className="tenant-record-card">
          <div className="section-heading"><div><p className="eyebrow">{t("Profil", "Profile")}</p><h2>{t("Coordonnées et identité", "Contact and identity")}</h2></div><UserRound size={21} /></div>
          <dl className="record-detail-list">
            <div><dt>{t("Téléphone", "Phone")}</dt><dd>{tenant.phone ?? "—"}</dd></div>
            <div><dt>Email</dt><dd>{tenant.email ?? "—"}</dd></div>
            <div><dt>{t("Langue", "Language")}</dt><dd>{tenant.preferredLanguage?.toUpperCase() ?? "—"}</dd></div>
            {canManage ? <div><dt>{t("Pièce d’identité", "Identity document")}</dt><dd>{tenant.identityDocumentType ? `${tenant.identityDocumentType.toUpperCase()} · ${tenant.identityDocumentNumber}` : "—"}</dd></div> : null}
          </dl>
        </Card>
        <Card id="location-actuelle" className="tenant-record-card tenant-current-lease-card">
          <div className="section-heading"><div><p className="eyebrow">{t("Location actuelle", "Current lease")}</p><h2>{current ? current.unitLabel : t("Aucune location active", "No active lease")}</h2></div><KeyRound size={21} /></div>
          {current ? <>
            <p>{current.propertyName}</p>
            <div className="tenant-current-lease-card__facts"><span><strong>{money(current.periodicTotalXaf)}</strong>{periodicAmountLabel(current.billingFrequency, t)}<small>{money(current.baseRentXaf)} {t("loyer", "rent")} + {money(current.recurringChargesXaf)} {t("charges", "charges")}</small></span><span><strong>{naturalDueDay(current.dueDay, current.billingFrequency, t)}</strong>{t("Date limite contractuelle", "Contractual due date")}</span></div>
            <Link className="button button--secondary" href={`/app/locations/${current.id}`}>{t("Voir le détail", "View details")}</Link>
          </> : <p>{t("Aucun bail actif n’est relié à ce dossier.", "No active lease is linked to this record.")}</p>}
        </Card>
      </div>
      {canManage ? <Card><div className="section-heading"><div><p className="eyebrow">WhatsApp</p><h2>{t("Préférences du locataire","Tenant preferences")}</h2></div></div><TenantWhatsAppPreferencesForm tenantId={tenant.id}/></Card> : null}

      <Card id="historique" className="tenant-history-card">
        <div className="section-heading"><div><p className="eyebrow">{t("Historique", "History")}</p><h2>{t("Locations", "Leases")}</h2></div><History size={21} /></div>
        {tenant.leases.length ? <div className="demo-list">{tenant.leases.map((lease) => <Link className="demo-list-row" href={`/app/locations/${lease.id}`} key={lease.id}><span className="demo-list-row__icon"><Home size={19} /></span><div><strong>{lease.propertyName} · {lease.unitLabel}</strong><span>{lease.startDate}{lease.endDate ? ` → ${lease.endDate}` : ""}</span></div>{statusBadge(lease.status, t)}<ChevronRight size={18} /></Link>)}</div> : <EmptyState title={t("Aucune location", "No leases")} description={t("Le dossier est prêt à être relié à une Unit.", "The record is ready to be linked to a Unit.")} />}
      </Card>

      {payments ? <PaymentHistoryPanel payments={payments} documents={documents ?? []} canRecord={canRecordPayment} leaseId={current?.id} /> : null}
      {documents ? <FinancialDocumentsPanel canShare={canShareDocuments} documents={documents} emailDeliveryEnabled={emailDeliveryEnabled} /> : null}
      {canManagePortal ? <TenantPortalAccessManagement
        email={tenant.email}
        leases={tenant.leases.map((lease) => ({ id: lease.id, label: `${lease.propertyName} · ${lease.unitLabel}`, status: lease.status }))}
        status={portalAccess}
        tenantId={tenant.id}
      /> : null}

      <div className="future-module-grid">
        <Card id="notes" className="future-module-card tenant-notes-card"><span className="future-module-card__icon"><StickyNote size={20} /></span><div><strong>{t("Notes internes", "Internal notes")}</strong><span>{tenant.internalNotes ?? t("Aucune note interne enregistrée.", "No internal note recorded.")}</span></div><Badge tone="neutral">{t("Interne", "Internal")}</Badge></Card>
      </div>
    </div>
  );
}

export function LeasesView({ leases, canManage }: { leases: LeaseSummary[]; canManage: boolean }) {
  const t = useCopy(); const [query, setQuery] = useState(""); const [view, setView] = useState<"cards" | "list">("cards");
  function chooseView(next: "cards" | "list") { setView(next); }
  const filtered = leases.filter((lease) => `${lease.tenantName} ${lease.propertyName} ${lease.unitLabel}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="page-stack resource-index-v2 tenancy-index-v2"><PageHeader eyebrow={t("Cycle locatif", "Lease lifecycle")} title={t("Locations", "Leases")} description={t("Brouillons, locations actives et historique — sans solde financier fictif.", "Drafts, active leases and history — without fake financial balances.")} action={canManage ? <Link className="button button--primary" href="/app/locations/nouveau"><Plus size={17} />{t("Nouvelle location", "New lease")}</Link> : undefined} /><LiveDataNotice /><div className="tenancy-list-toolbar"><label className="demo-search"><Search size={18} /><span className="sr-only">{t("Rechercher", "Search")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Bien, unité ou locataire", "Property, unit or tenant")} /></label><div className="view-switcher" role="group" aria-label={t("Mode d’affichage", "Display mode")}><button aria-pressed={view === "list"} onClick={() => chooseView("list")} type="button"><List size={17} />{t("Liste", "List")}</button><button aria-pressed={view === "cards"} onClick={() => chooseView("cards")} type="button"><LayoutGrid size={17} />{t("Cartes", "Cards")}</button></div></div>
    {filtered.length ? view === "cards" ? <div className="demo-card-grid">{filtered.map((lease) => <Link className="demo-resource-card" href={`/app/locations/${lease.id}`} key={lease.id}><span className="demo-resource-card__icon"><KeyRound size={22} /></span><div><div className="tenancy-card-heading"><h2>{lease.propertyName} · {lease.unitLabel}</h2>{statusBadge(lease.status, t)}</div><p>{lease.tenantName}</p><div className="demo-meta"><span>{money(lease.baseRentXaf)} + {money(lease.recurringChargesXaf)}</span><span>{frequencyLabel(lease.billingFrequency, t)}</span><span>{lease.startDate}{lease.endDate ? ` → ${lease.endDate}` : ""}</span></div></div><ChevronRight size={20} /></Link>)}</div> : <Card className="lease-table-card"><div className="lease-table" role="table"><div className="lease-table__head" role="row"><span>{t("Logement", "Unit")}</span><span>{t("Locataire", "Tenant")}</span><span>{t("Total", "Total")}</span><span>{t("État", "Status")}</span></div>{filtered.map((lease) => <Link className="lease-table__row" href={`/app/locations/${lease.id}`} key={lease.id} role="row"><span><strong>{lease.unitLabel}</strong><small>{lease.propertyName}</small></span><span>{lease.tenantName}</span><span className="financial-value">{money(lease.periodicTotalXaf)}</span><span>{statusBadge(lease.status, t)}<ChevronRight size={17} /></span></Link>)}</div></Card> : <Card><EmptyState icon={KeyRound} title={query ? t("Aucun résultat", "No results") : t("Aucune location", "No leases")} description={query ? t("Modifiez la recherche.", "Change your search.") : t("Créez le premier brouillon de location.", "Create the first lease draft.")} action={canManage && !query ? <Link className="button button--primary" href="/app/locations/nouveau">{t("Créer une location", "Create lease")}</Link> : undefined} /></Card>}
  </div>;
}

type LeaseDraft = LeaseInput;
const blankLease = (options: LeaseOptions, tenantId?: string, unitId?: string): LeaseDraft => {
  const selectedUnit = options.units.find((unit) => unit.id === unitId && !unit.occupied) ?? options.units.find((unit) => !unit.occupied);
  return { tenantId: options.tenants.find((tenant) => tenant.id === tenantId)?.id ?? options.tenants[0]?.id ?? "", propertyId: selectedUnit?.propertyId ?? "", unitId: selectedUnit?.id ?? "", startDate: new Date().toISOString().slice(0, 10), endDate: null, baseRentXaf: selectedUnit?.referenceRentXaf ?? 0, recurringChargesXaf: 0, securityDepositXaf: 0, initialPrepaymentAmountXaf: 0, billingFrequency: "monthly", dueDay: 5, generateDueDaysBefore: 5, entryProrationMode: "none", exitProrationMode: "none", entryProrationOverrideXaf: null, entryProrationOverrideReason: null, exitProrationOverrideXaf: null, exitProrationOverrideReason: null, paymentTerms: null };
};

function LeaseFields({ value, options, onChange }: { value: LeaseDraft; options: LeaseOptions; onChange: (next: LeaseDraft) => void }) {
  const t = useCopy(); const total = value.baseRentXaf + value.recurringChargesXaf;
  const coverage = prepaymentCoverage(total, value.initialPrepaymentAmountXaf);
  const entryDetail = value.startDate ? calendarEntryProrationDetail(total, value.startDate, value.entryProrationMode) : null;
  const selectedUnit = options.units.find((unit) => unit.id === value.unitId);
  const groups = new Map<string, LeaseOptions["units"]>();
  for (const unit of options.units) groups.set(unit.propertyName, [...(groups.get(unit.propertyName) ?? []), unit]);
  function set<K extends keyof LeaseDraft>(key: K, next: LeaseDraft[K]) {
    const changed = { ...value, [key]: next };
    if (key === "unitId") {
      const unit = options.units.find((candidate) => candidate.id === next);
      changed.propertyId = unit?.propertyId ?? "";
      changed.baseRentXaf = unit?.referenceRentXaf ?? 0;
    }
    if (key === "billingFrequency" && next !== "monthly" && changed.entryProrationMode === "calendar_days") {
      changed.entryProrationMode = "none";
    }
    onChange(changed);
  }
  return <>
    <div className="form-grid"><label className="field"><span>{t("Locataire", "Tenant")}</span><select value={value.tenantId} onChange={(event) => set("tenantId", event.target.value)} required>{options.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.fullName}</option>)}</select></label>
      <label className="field"><span>{t("Unité", "Unit")}</span><select value={value.unitId} onChange={(event) => set("unitId", event.target.value)} required>{[...groups].map(([propertyName, units]) => <optgroup label={propertyName} key={propertyName}>{units.map((unit) => <option disabled={unit.occupied} key={unit.id} value={unit.id}>{unit.label}{unit.occupied ? ` — ${t("occupée", "occupied")}` : ` — ${t("vacante", "vacant")}`}</option>)}</optgroup>)}</select></label>
      <label className="field"><span>{t("Début", "Start")}</span><input type="date" value={value.startDate} onChange={(event) => set("startDate", event.target.value)} required /></label><label className="field"><span>{t("Fin prévue (facultative)", "Planned end (optional)")}</span><input type="date" value={value.endDate ?? ""} onChange={(event) => set("endDate", event.target.value || null)} /></label>
      <label className="field"><span>{t("Loyer hors charges (XAF)", "Base rent (XAF)")}</span><input min="1" placeholder={t("Ex. 40 000", "E.g. 40,000")} type="number" value={value.baseRentXaf || ""} onChange={(event) => set("baseRentXaf", Number(event.target.value))} required />{selectedUnit?.referenceRentXaf === value.baseRentXaf ? <small>{t("Prérempli depuis le loyer de référence de l’unité.", "Prefilled from the Unit reference rent.")}</small> : <small>{t("Montant contractuel modifiable, indépendant de l’unité.", "Editable contractual amount, independent from the Unit.")}</small>}</label>
      <label className="field"><span>{t("Charges récurrentes (XAF)", "Recurring charges (XAF)")}</span><input min="0" placeholder={t("Ex. 2 000", "E.g. 2,000")} type="number" value={value.recurringChargesXaf || ""} onChange={(event) => set("recurringChargesXaf", Number(event.target.value))} /><small>{t("Ex. eau, gardiennage, câble, entretien des parties communes", "E.g. water, caretaker, cable, common-area maintenance")}</small></label>
      <label className="field"><span>{t("Dépôt de garantie", "Security deposit")}</span><select value={value.securityDepositXaf > 0 ? "yes" : "no"} onChange={(event) => set("securityDepositXaf", event.target.value === "yes" ? Math.max(value.baseRentXaf, 1) : 0)}><option value="no">{t("Aucun dépôt", "No deposit")}</option><option value="yes">{t("Un dépôt est prévu", "A deposit is required")}</option></select><small>{t("Le dépôt est facultatif et reste distinct du loyer.", "The deposit is optional and remains separate from rent.")}</small></label>
      {value.securityDepositXaf > 0 ? <label className="field"><span>{t("Montant du dépôt (XAF)", "Deposit amount (XAF)")}</span><input min="1" placeholder={t("Ex. 60 000", "E.g. 60,000")} type="number" value={value.securityDepositXaf} onChange={(event) => set("securityDepositXaf", Number(event.target.value))} required /><small>{t("Aucune règle automatique d’un ou deux mois n’est appliquée.", "No automatic one- or two-month rule is applied.")}</small></label> : null}
      <label className="field"><span>{t("Montant prépayé pour loyers et charges (XAF)", "Amount prepaid for rent and charges (XAF)")}</span><input min="0" placeholder={t("Ex. 126 000 pour 3 mois à 42 000", "E.g. 126,000 for 3 periods at 42,000")} type="number" value={value.initialPrepaymentAmountXaf || ""} onChange={(event) => set("initialPrepaymentAmountXaf", Number(event.target.value))} /><small>{t("Somme versée à l’avance pour couvrir des périodes. Le dépôt n’est pas inclus.", "Paid ahead to cover periods. The deposit is not included.")}</small></label>
      <label className="field"><span>{t("Périodicité", "Frequency")}</span><select value={value.billingFrequency} onChange={(event) => set("billingFrequency", event.target.value as BillingFrequency)}><option value="monthly">{t("Mensuelle", "Monthly")}</option><option value="quarterly">{t("Trimestrielle", "Quarterly")}</option><option value="semiannual">{t("Semestrielle", "Semiannual")}</option><option value="annual">{t("Annuelle", "Annual")}</option></select></label>
      <label className="field"><span>{t("Jour limite de paiement", "Payment due day")}</span><select value={value.dueDay} onChange={(event) => set("dueDay", Number(event.target.value))}>{Array.from({ length: 28 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}</select><small>{t(`Ex. le ${value.dueDay} de chaque mois. Les jours 1 à 28 fonctionnent aussi pour les mois courts.`, `E.g. the ${value.dueDay}th of each month. Days 1–28 also work in short months.`)}</small></label>
      <label className="field"><span>{t("Générer l’avis avant l’échéance", "Prepare notice before due date")}</span><select value={value.generateDueDaysBefore} onChange={(event) => set("generateDueDaysBefore", Number(event.target.value))}>{DUE_NOTICE_DAYS.map((days) => <option key={days} value={days}>J-{days}</option>)}</select><small>{t(`J-${value.generateDueDaysBefore} : l’avis sera préparé ${value.generateDueDaysBefore} jours avant la date limite.`, `J-${value.generateDueDaysBefore}: the notice will be prepared ${value.generateDueDaysBefore} days before the due date.`)}</small></label>
      <div className="field field--readonly"><span>{t("Rappel de retard", "Overdue reminder")}</span><strong>{t("Tous les 10 jours", "Every 10 days")}</strong><small>{t("Réglage automatique KJORA. Les notifications réelles arrivent en 6C3.", "Automatic KJORA setting. Real notifications arrive in 6C3.")}</small></div>
      <label className="field"><span>{t("Prorata du premier loyer", "First rent proration")}</span><select value={value.entryProrationMode} onChange={(event) => set("entryProrationMode", event.target.value as ProrationMode)}><option value="none">{t("Aucun", "None")}</option><option disabled={value.billingFrequency !== "monthly"} value="calendar_days">{t("Calcul automatique", "Automatic calculation")}</option></select><small>{value.billingFrequency === "monthly" ? t("À utiliser pour une entrée en cours de mois. Loyer et charges sont proratisés selon les jours occupés.", "Use for a mid-month move-in. Rent and charges are prorated by occupied days.") : t("Le prorata automatique 6B.1 est limité à la périodicité mensuelle.", "The 6B.1 automatic proration is limited to monthly billing.")}</small></label>
      <label className="field"><span>{t("Prorata de sortie", "Exit proration")}</span><select value={value.exitProrationMode} onChange={(event) => set("exitProrationMode", event.target.value as ProrationMode)}><option value="none">{t("Aucun", "None")}</option><option value="calendar_days">{t("Jours calendaires", "Calendar days")}</option></select></label>
    </div>
    <label className="field"><span>{t("Modalités de paiement (facultatif)", "Payment terms (optional)")}</span><textarea maxLength={1000} minLength={3} placeholder={t("Ex. virement bancaire avant le 5 de chaque mois, référence « LOYER-<nom> ».", "E.g. bank transfer before the 5th of each month, reference “RENT-<name>”.")} rows={3} value={value.paymentTerms ?? ""} onChange={(event) => set("paymentTerms", event.target.value.trim() ? event.target.value : null)} /><small>{t("Repris tel quel dans la clause « Modalités de paiement » du contrat généré. Laissé vide, cette clause n’apparaît pas dans le contrat plutôt que d’afficher une valeur par défaut inventée.", "Carried as-is into the generated contract's “Payment terms” clause. Left empty, that clause is omitted from the contract rather than showing an invented default.")}</small></label>
    <Card muted className="tenancy-calculation"><span>{t("Total périodique dérivé", "Derived periodic total")}</span><strong className="financial-value">{money(total)}</strong><small>{prepaymentLabel(coverage.fullPeriods, coverage.remainderXaf, value.billingFrequency, t)}</small><small>{t("Calcul informatif uniquement : aucun paiement, crédit Ledger ou échéance n’est créé.", "Informational calculation only: no payment, Ledger credit or due is created.")}</small></Card>
    {value.entryProrationMode === "calendar_days" && entryDetail ? <div className="proration-breakdown" role="status"><strong>{shortDate(entryDetail.startDate)} → {shortDate(entryDetail.endDate)} : {entryDetail.occupiedDays} {t("jours sur", "days out of")} {entryDetail.daysInPeriod}</strong><span>({money(value.baseRentXaf)} + {money(value.recurringChargesXaf)}) × {entryDetail.occupiedDays} / {entryDetail.daysInPeriod} = <b>{money(entryDetail.amountXaf)}</b></span><small>{t("Le loyer hors charges et les charges récurrentes sont tous deux proratisés.", "Both base rent and recurring charges are prorated.")}</small></div> : null}
    <details className="tenancy-override"><summary>{t("Correction manuelle du prorata (facultative)", "Manual proration override (optional)")}</summary><div className="form-grid"><label className="field"><span>{t("Montant d’entrée corrigé", "Entry override amount")}</span><input min="0" type="number" value={value.entryProrationOverrideXaf ?? ""} onChange={(event) => set("entryProrationOverrideXaf", event.target.value ? Number(event.target.value) : null)} /></label><label className="field"><span>{t("Motif obligatoire", "Required reason")}</span><input maxLength={500} value={value.entryProrationOverrideReason ?? ""} onChange={(event) => set("entryProrationOverrideReason", event.target.value || null)} /></label></div></details>
  </>;
}

export function LeaseCreateForm({ options, initialTenantId, initialUnitId }: { options: LeaseOptions; initialTenantId?: string; initialUnitId?: string }) {
  const t = useCopy(); const router = useRouter(); const [draft, setDraft] = useState(() => blankLease(options, initialTenantId, initialUnitId)); const [initialReceived, setInitialReceived] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setMessage(null); const result = await mutate({ action: "create_lease", ...draft }); setBusy(false); if (!result.ok || typeof result.body.leaseId !== "string") return setMessage(friendlyError(result.body.error as string | undefined, t)); const received = Number(initialReceived); router.push(`/app/locations/${result.body.leaseId}${Number.isSafeInteger(received) && received > 0 ? `?initialReceived=${received}` : ""}`); router.refresh(); }
  if (!options.tenants.length || !options.units.some((unit) => !unit.occupied)) return <div className="page-stack"><Card><EmptyState icon={KeyRound} title={t("Préconditions manquantes", "Missing prerequisites")} description={t("Ajoutez un locataire et conservez au moins une unité vacante avant de créer une location.", "Add a tenant and keep at least one unit vacant before creating a lease.")} action={<Link className="button button--primary" href={!options.tenants.length ? "/app/locataires/nouveau" : "/app/biens"}>{t("Continuer", "Continue")}</Link>} /></Card></div>;
  return <div className="page-stack demo-narrow form-page-v2"><Link className="demo-back" href="/app/locations"><ArrowLeft size={17} />{t("Toutes les locations", "All leases")}</Link><PageHeader eyebrow={t("Locations", "Leases")} title={t("Créer un brouillon", "Create a draft")} description={t("Les montants sont préparés sans générer d’échéance, ledger ou paiement.", "Amounts are prepared without generating dues, ledger entries or payments.")} /><LiveDataNotice /><Card><form className="form-stack" onSubmit={submit}><LeaseFields value={draft} options={options} onChange={setDraft} /><label className="field"><span>{t("Montant déjà réellement reçu (facultatif)", "Amount already actually received (optional)")}</span><input min="0" inputMode="numeric" type="number" value={initialReceived} onChange={(event) => setInitialReceived(event.target.value)} /><small>{t("Après activation, KJORA ouvrira l’étape de répartition. Aucun paiement n’est créé par le brouillon.", "After activation, KJORA opens the allocation step. The draft creates no payment.")}</small></label><button className="button button--primary" disabled={busy} type="submit">{busy ? t("Enregistrement…", "Saving…") : t("Enregistrer le brouillon", "Save draft")}</button>{message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}</form></Card></div>;
}

// CONTRATS-UX-PILOTE-01 — le formulaire complet (LeaseFields) reste réservé
// aux baux « draft » (les conditions financières d'un bail actif sont
// verrouillées par le trigger active_lease_terms_immutable). Mais
// `payment_terms` n'a JAMAIS fait partie de cette liste verrouillée — il
// reste modifiable même sur un bail actif (déjà couvert par pgTAP,
// rls_africa_contracts_performance_01_axis_b.test.sql). Avant ce correctif,
// le bouton « Compléter sur le bail » du parcours contrat menait donc à une
// impasse pour tout bail actif : le formulaire d'édition n'apparaît que
// pour un brouillon, la clause restait donc impossible à compléter dans les
// faits. Cette carte dédiée, toujours visible, corrige ce défaut et sert
// de cible d'ancrage (`?focus=payment_terms`) pour le bouton du parcours
// contrat.
function LeasePaymentTermsCard({ lease, canManage }: { lease: LeaseSummary; canManage: boolean }) {
  const t = useCopy();
  const searchParams = useSearchParams();
  const shouldFocus = searchParams.get("focus") === "payment_terms";
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(lease.paymentTerms ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (shouldFocus) fieldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (shouldFocus) fieldRef.current?.focus();
  }, [shouldFocus]);
  async function save() {
    setBusy(true); setMessage(null);
    const result = await mutate({ action: "update_lease", leaseId: lease.id, ...lease, paymentTerms: value.trim() ? value : null });
    setBusy(false);
    setMessage(result.ok ? t("Modalités de paiement enregistrées.", "Payment terms saved.") : friendlyError(result.body.error as string | undefined, t));
  }
  return <Card id="lease-payment-terms" className={shouldFocus ? "lease-payment-terms-card lease-payment-terms-card--highlighted" : "lease-payment-terms-card"}>
    <div className="section-heading"><div><p className="eyebrow">{t("Contrat", "Contract")}</p><h2>{t("Modalités de paiement", "Payment terms")}</h2></div></div>
    <label className="field"><span>{t("Modalités de paiement (facultatif)", "Payment terms (optional)")}</span><textarea maxLength={1000} minLength={3} placeholder={t("Ex. virement bancaire avant le 5 de chaque mois, référence « LOYER-<nom> ».", "E.g. bank transfer before the 5th of each month, reference “RENT-<name>”.")} ref={fieldRef} rows={3} value={value} onChange={(event) => setValue(event.target.value)} /><small>{t("Repris tel quel dans la clause « Modalités de paiement » du contrat généré. Modifiable même après activation de la location.", "Carried as-is into the generated contract's “Payment terms” clause. Editable even after the lease is activated.")}</small></label>
    {canManage ? <button className="button button--primary" disabled={busy} onClick={save} type="button">{busy ? t("Enregistrement…", "Saving…") : t("Enregistrer", "Save")}</button> : null}
    {message ? <p className="form-feedback" role="status">{message}</p> : null}
  </Card>;
}

export function LeaseDetailView({ lease, options, canManage, financial, tenantFinancial, payments, canRecordPayment, documents, canShareDocuments, emailDeliveryEnabled, initialReceivedXaf = 0 }: { lease: LeaseSummary; options: LeaseOptions; canManage: boolean; financial: LeaseFinancialDetail | null; tenantFinancial: TenantFinancialPosition | null; payments: PaymentSummary[] | null; canRecordPayment: boolean; documents: FinancialDocumentSummary[] | null; canShareDocuments: boolean; emailDeliveryEnabled: boolean; initialReceivedXaf?: number }) {
  const t = useCopy();
  const { language } = usePreferences();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LeaseDraft>(lease);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [endedOn, setEndedOn] = useState(new Date().toISOString().slice(0, 10));
  const [endReason, setEndReason] = useState("");
  const entryProration = lease.entryProrationOverrideXaf ?? calendarEntryProration(lease.periodicTotalXaf, lease.startDate, lease.entryProrationMode);
  const today = new Date().toISOString().slice(0, 10);
  const nextScheduledDue = financial?.dues.find((due) => due.status !== "cancelled" && due.kind !== "deposit" && due.kind !== "adjustment" && due.dueDate >= today) ?? null;
  const amountBreakdown = `${money(lease.baseRentXaf)} ${t("loyer", "rent")} + ${money(lease.recurringChargesXaf)} ${t("charges", "charges")}`;
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await mutate({ action: "update_lease", leaseId: lease.id, ...draft });
    setBusy(false);
    if (!result.ok) return setMessage(friendlyError(result.body.error as string | undefined, t));
    setEditing(false);
    setMessage(t("Brouillon modifié.", "Draft updated."));
    router.refresh();
  }
  async function activate() {
    if (!window.confirm(t("Activer cette location ? L’unité deviendra occupée et les conditions seront figées.", "Activate this lease? The unit will become occupied and terms will be locked."))) return;
    setBusy(true);
    const result = await mutate({ action: "activate_lease", leaseId: lease.id });
    setBusy(false);
    if (!result.ok) return setMessage(friendlyError(result.body.error as string | undefined, t));
    if (initialReceivedXaf > 0 && canRecordPayment) {
      router.push(`/app/paiements/nouveau?lease=${lease.id}&amount=${initialReceivedXaf}&initial=1`);
    } else router.refresh();
  }
  async function endLease() {
    setBusy(true);
    const result = await mutate({ action: "end_lease", leaseId: lease.id, endedOn, endReason });
    setBusy(false);
    if (!result.ok) return setMessage(friendlyError(result.body.error as string | undefined, t));
    setEnding(false);
    router.refresh();
  }

  return (
    <div className="page-stack lease-detail-v2">
      <Link className="demo-back" href="/app/locations"><ArrowLeft size={17} />{t("Toutes les locations", "All leases")}</Link>
      <section className="lease-hero">
        <div className="lease-hero__heading">
          <p className="eyebrow">{t("Détail de la location", "Lease details")}</p>
          <div className="lease-hero__title-row"><h1>{lease.unitLabel}</h1>{statusBadge(lease.status, t)}</div>
          <p>{lease.propertyName} · {lease.tenantName}</p>
          <div className="lease-hero__links">
            <Link href={`/app/locataires/${lease.tenantId}`}><UserRound size={15} />{lease.tenantName}</Link>
            <Link href={`/app/biens/${lease.propertyId}`}><Building2 size={15} />{lease.propertyName}</Link>
          </div>
        </div>
        <div className="lease-hero__metrics" aria-label={t("Synthèse contractuelle", "Contract summary")}>
          <div className="lease-hero__metric lease-hero__metric--primary"><small>{periodicAmountLabel(lease.billingFrequency, t)}</small><strong className="financial-value">{money(lease.periodicTotalXaf)}</strong><span>{amountBreakdown}</span></div>
          <div className="lease-hero__metric"><small>{t("Date limite", "Due date")}</small><strong>{naturalDueDay(lease.dueDay, lease.billingFrequency, t)}</strong><span>{nextScheduledDue ? t(`Prochaine échéance : ${longDate(nextScheduledDue.dueDate, language)}`, `Next due: ${longDate(nextScheduledDue.dueDate, language)}`) : t("Selon le calendrier contractuel", "Based on the contractual schedule")}</span></div>
          <div className="lease-hero__metric"><small>{t("Avis d’échéance", "Due notice")}</small><strong>{nextScheduledDue ? t(`Prévu le ${longDate(nextScheduledDue.noticeDate, language)}`, `Scheduled for ${longDate(nextScheduledDue.noticeDate, language)}`) : t(`${lease.generateDueDaysBefore} jours avant l’échéance`, `${lease.generateDueDaysBefore} days before the due date`)}</strong><span>{t(`${lease.generateDueDaysBefore} jours avant chaque échéance`, `${lease.generateDueDaysBefore} days before each due date`)}</span></div>
        </div>
        {canManage && lease.status === "draft" ? <button className="button button--on-dark lease-hero__edit" onClick={() => setEditing((value) => !value)} type="button"><Pencil size={17} />{t("Modifier", "Edit")}</button> : null}
      </section>

      <LiveDataNotice />
      {message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}
      {editing ? <Card><form className="form-stack" onSubmit={update}><LeaseFields value={draft} options={options} onChange={setDraft} /><div className="demo-form-actions"><button className="button button--primary" disabled={busy} type="submit">{t("Enregistrer", "Save")}</button><button className="button button--secondary" onClick={() => setEditing(false)} type="button">{t("Annuler", "Cancel")}</button></div></form></Card> : null}
      {/* CONTRATS-UX-PILOTE-01 — payment_terms n'est PAS verrouillé par
          active_lease_terms_immutable : contrairement au reste des
          conditions du bail, il reste éditable même une fois la location
          active. Affiché uniquement dans ce cas pour éviter un doublon avec
          le champ déjà présent dans LeaseFields (brouillon, ci-dessus). */}
      {lease.status === "active" ? <LeasePaymentTermsCard lease={lease} canManage={canManage} /> : null}

      <nav className="record-tabs" aria-label={t("Sections de la location", "Lease sections")}>
        <a aria-current="page" href="#informations">{t("Informations", "Information")}</a>
        {financial ? <a href="#echeances">{t("Échéances", "Dues")}</a> : null}
        {payments ? <a href="#paiements">{t("Paiements", "Payments")}</a> : null}
        {documents ? <a href="#documents">{t("Documents", "Documents")}</a> : null}
        <span>{t("Activité · à venir", "Activity · coming later")}</span>
      </nav>

      {tenantFinancial ? <TenantFinancialSummary tenantId={lease.tenantId} financial={tenantFinancial} /> : null}

      <Card className="lease-contract-card" id="informations">
        <div className="section-heading">
          <div><p className="eyebrow">{t("Informations", "Information")}</p><h2>{t("Conditions contractuelles", "Contract terms")}</h2></div>
          <ShieldCheck size={22} />
        </div>
        <div className="lease-money-grid">
          <div><span>{t("Loyer hors charges", "Base rent")}</span><strong className="financial-value">{money(lease.baseRentXaf)}</strong></div>
          <div><span>{t("Charges récurrentes", "Recurring charges")}</span><strong className="financial-value">{money(lease.recurringChargesXaf)}</strong></div>
          <div><span>{t("Dépôt de garantie", "Security deposit")}</span><strong className="financial-value">{money(lease.securityDepositXaf)}</strong><small>{t("Hors loyers payés", "Not rent paid")}</small></div>
          <div><span>{t("Montant prépayé", "Prepaid amount")}</span><strong className="financial-value">{money(lease.initialPrepaymentAmountXaf)}</strong><small>{prepaymentLabel(lease.prepaidFullPeriods, lease.prepaymentRemainderXaf, lease.billingFrequency, t)}</small></div>
        </div>
        <dl className="lease-contract-grid">
          <div><dt>{t("Période", "Period")}</dt><dd>{shortDate(lease.startDate)}{lease.endDate ? ` → ${shortDate(lease.endDate)}` : " → —"}</dd></div>
          <div><dt>{t("Périodicité", "Frequency")}</dt><dd>{frequencyLabel(lease.billingFrequency, t)}</dd></div>
          <div><dt>{t("Date limite", "Due date")}</dt><dd>{naturalDueDay(lease.dueDay, lease.billingFrequency, t)}</dd></div>
          <div><dt>{t("Avis d’échéance", "Due notice")}</dt><dd>{t(`${lease.generateDueDaysBefore} jours avant chaque échéance`, `${lease.generateDueDaysBefore} days before each due date`)}</dd></div>
          <div><dt>{t("Rappel de retard", "Overdue reminder")}</dt><dd>{t("Tous les 10 jours · automatique KJORA", "Every 10 days · automatic KJORA")}</dd></div>
          <div><dt>{t("Prorata du premier loyer", "First rent proration")}</dt><dd>{money(entryProration)}{lease.entryProrationOverrideXaf !== null ? ` · ${t("corrigé avec motif", "overridden with reason")}` : ""}</dd></div>
          {lease.endedOn ? <div><dt>{t("Sortie effective", "Effective end")}</dt><dd>{shortDate(lease.endedOn)} · {money(lease.exitProrationOverrideXaf ?? calendarExitProration(lease.periodicTotalXaf, lease.endedOn, lease.exitProrationMode))}</dd></div> : null}
          {lease.endReason ? <div><dt>{t("Motif de fin", "End reason")}</dt><dd>{lease.endReason}</dd></div> : null}
        </dl>
        <p className="financial-preparation-note">{lease.status === "draft"
          ? t("Préparation uniquement : les échéances et le crédit d’ouverture seront créés à l’activation. Aucun paiement ne sera enregistré automatiquement.", "Preparation only: dues and opening credit will be created on activation. No payment will be recorded automatically.")
          : t("Les échéances, crédits et paiements réels proviennent du Ledger financier.", "Dues, credits and real payments come from the financial Ledger.")}</p>
        {canManage && lease.status === "draft" ? <div className="tenancy-sensitive-action"><p>{t("L’activation rend l’unité occupée et fige les conditions. KJORA vérifie automatiquement qu’il n’y a pas de conflit avec une autre location.", "Activation marks the unit occupied and locks terms. KJORA automatically checks there's no conflict with another lease.")}</p><button className="button button--primary" disabled={busy} onClick={activate} type="button">{t("Activer la location", "Activate lease")}</button></div> : null}
        {canManage && lease.status === "active" ? <div className="tenancy-sensitive-action"><p>{t("La date de sortie n’est modifiable que dans l’action dédiée avec confirmation explicite.", "The effective end date is only editable in the dedicated action with explicit confirmation.")}</p><button className="button button--secondary" disabled={busy} onClick={() => setEnding(true)} type="button">{t("Terminer la location", "End lease")}</button></div> : null}
      </Card>

      {financial ? <LeaseDuesPanel financial={financial} /> : null}
      {payments ? <PaymentHistoryPanel payments={payments} documents={documents ?? []} canRecord={canRecordPayment} leaseId={lease.id} /> : null}
      {documents ? <FinancialDocumentsPanel canShare={canShareDocuments} documents={documents} emailDeliveryEnabled={emailDeliveryEnabled} /> : null}

      {ending ? <div className="confirmation-modal" role="presentation"><button aria-label={t("Fermer", "Close")} className="confirmation-modal__backdrop" onClick={() => setEnding(false)} type="button" /><section aria-labelledby="end-lease-title" aria-modal="true" className="confirmation-modal__panel" role="dialog"><div className="confirmation-modal__header"><div><p className="eyebrow">{t("Action sensible", "Sensitive action")}</p><h2 id="end-lease-title">{t("Terminer la location", "End lease")}</h2></div><button aria-label={t("Fermer", "Close")} className="icon-button" onClick={() => setEnding(false)} type="button"><X size={18} /></button></div><div className="confirmation-modal__warning"><CircleAlert size={21} /><p>{t("La fin de la location libérera l’unité à partir de la date effective. L’historique du bail restera protégé.", "Ending the lease will free the Unit from the effective date. Lease history remains protected.")}</p></div><label className="field"><span>{t("Date de sortie effective", "Effective end date")}</span><input min={lease.startDate} type="date" value={endedOn} onChange={(event) => setEndedOn(event.target.value)} required /></label><label className="field"><span>{t("Motif (facultatif)", "Reason (optional)")}</span><textarea maxLength={500} placeholder={t("Ex. départ convenu avec le locataire", "E.g. departure agreed with the tenant")} rows={3} value={endReason} onChange={(event) => setEndReason(event.target.value)} /></label><div className="confirmation-modal__summary"><strong>{lease.propertyName} · {lease.unitLabel}</strong><span>{lease.tenantName}</span><span>{t("Conséquence : unité libérée, bail figé en historique.", "Consequence: Unit freed, lease locked in history.")}</span></div><div className="demo-form-actions"><button className="button button--secondary" disabled={busy} onClick={() => setEnding(false)} type="button">{t("Annuler", "Cancel")}</button><button className="button button--danger" disabled={busy || !endedOn} onClick={endLease} type="button">{busy ? t("Clôture…", "Ending…") : t("Confirmer la fin", "Confirm end")}</button></div></section></div> : null}

    </div>
  );
}

export function MissingTenancyResource({ leases = false }: { leases?: boolean }) {
  const t = useCopy(); const href = leases ? "/app/locations" : "/app/locataires";
  return <div className="page-stack"><Card><EmptyState title={t("Ressource introuvable ou inaccessible", "Resource not found or unavailable")} description={t("Vérifiez l’organisation active ou revenez à la liste.", "Check the active Organization or return to the list.")} action={<Link className="button button--primary" href={href}>{t("Retour à la liste", "Back to list")}</Link>} /></Card></div>;
}
