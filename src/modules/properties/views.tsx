"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  ArrowLeft,
  Building2,
  ChevronRight,
  Home,
  ImageIcon,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { usePreferences } from "@/core/preferences/preferences-provider";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/ui";
import { entitlementErrorFromBody, QuotaLimitModal } from "@/core/entitlements/quota-modal";
import type { EntitlementError } from "@/core/entitlements/model";
import {
  filterProperties,
  type PropertyDetail,
  type PropertySummary,
  type PropertyType,
  type UnitRecord,
  type UnitType,
} from "@/modules/properties/model";

function useCopy() {
  const { language } = usePreferences();
  return (fr: string, en: string) => language === "FR" ? fr : en;
}

function propertyLabel(type: PropertyType, t: ReturnType<typeof useCopy>) {
  return type === "house" ? t("Maison", "House") : t("Immeuble", "Building");
}

function unitLabel(type: UnitType, t: ReturnType<typeof useCopy>) {
  return {
    whole_house: t("Maison entière", "Whole house"),
    apartment: t("Appartement", "Apartment"),
    studio: "Studio",
    room: t("Chambre", "Room"),
    shop: t("Boutique", "Shop"),
    office: t("Bureau / local", "Office / commercial unit"),
  }[type];
}

function money(value: number) {
  return `${value.toLocaleString("fr-FR")} XAF`;
}

function LiveDataNotice() {
  const t = useCopy();
  return (
    <div className="live-data-notice" role="note">
      <span aria-hidden="true" />
      {t("Données enregistrées dans l’Organization active", "Saved data from the active Organization")}
    </div>
  );
}

function friendlyError(code: string | undefined, t: ReturnType<typeof useCopy>) {
  if (code === "duplicate_resource") return t("Ce nom ou repère existe déjà ici.", "This name or reference already exists here.");
  if (code === "forbidden") return t("Vous n’avez plus la permission d’effectuer cette action.", "You no longer have permission to perform this action.");
  if (code === "house_units_locked") return t("Une maison utilise uniquement son unité « Maison entière ».", "A house only uses its “Whole house” unit.");
  if (code?.startsWith("invalid_")) return t("Vérifiez les informations saisies.", "Check the information you entered.");
  if (code === "business_rule_rejected") return t("Cette modification est incompatible avec l’état actuel de la ressource.", "This change is incompatible with the resource’s current state.");
  return t("L’enregistrement n’a pas abouti. Aucune donnée n’a été modifiée.", "Saving failed. No data was changed.");
}

async function mutate(payload: Record<string, unknown>) {
  const response = await fetch("/api/rentals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, body, entitlementError: response.ok ? null : entitlementErrorFromBody(body) };
}

export function PropertiesView({
  properties,
  canManage,
}: {
  properties: PropertySummary[];
  canManage: boolean;
}) {
  const t = useCopy();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => filterProperties(properties, query), [properties, query]);
  return (
    <div className="page-stack resource-index-v2">
      <PageHeader
        eyebrow={t("Patrimoine", "Portfolio")}
        title={t("Biens", "Properties")}
        description={t(
          "Maisons et immeubles enregistrés dans l’Organization active.",
          "Houses and buildings saved in the active Organization.",
        )}
        action={canManage ? <Link className="button button--primary" href="/app/biens/nouveau"><Plus size={17} />{t("Ajouter un bien", "Add property")}</Link> : undefined}
      />
      <LiveDataNotice />
      <label className="demo-search">
        <Search aria-hidden="true" size={18} />
        <span className="sr-only">{t("Rechercher", "Search")}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("Rechercher un bien ou une localité", "Search a property or locality")}
        />
      </label>
      {filtered.length ? (
        <div className="demo-card-grid">
          {filtered.map((property) => (
            <Link className="demo-resource-card" href={`/app/biens/${property.id}`} key={property.id}>
              <span className="demo-resource-card__icon"><Building2 size={22} /></span>
              <div>
                <p className="eyebrow">{propertyLabel(property.type, t)}</p>
                <h2>{property.name}</h2>
                <p>{property.locality}</p>
                <div className="demo-meta">
                  <span>{property.unitCount} {t("unité(s)", "unit(s)")}</span>
                  <span>{property.unitCount - property.vacantCount} {t("occupée(s)", "occupied")}</span>
                  <span>{property.vacantCount} {t("vacante(s)", "vacant")}</span>
                </div>
              </div>
              <ChevronRight aria-hidden="true" size={20} />
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={Building2}
            title={query ? t("Aucun résultat", "No results") : t("Aucun bien", "No properties")}
            description={query
              ? t("Modifiez la recherche.", "Change your search.")
              : t("Ajoutez le premier bien de cette Organization.", "Add this Organization’s first property.")}
            action={canManage && !query ? <Link className="button button--primary" href="/app/biens/nouveau">{t("Ajouter un bien", "Add property")}</Link> : undefined}
          />
        </Card>
      )}
    </div>
  );
}

export function PropertyCreateForm() {
  const t = useCopy();
  const { language } = usePreferences();
  const router = useRouter();
  const [type, setType] = useState<PropertyType>("house");
  const [referenceRentXaf, setReferenceRentXaf] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState<EntitlementError | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const result = await mutate({
      action: "create_property",
      name: form.get("name"),
      locality: form.get("locality"),
      type,
      referenceRentXaf: type === "house" ? referenceRentXaf : null,
    });
    setBusy(false);
    if (!result.ok || typeof result.body.propertyId !== "string") {
      if (result.entitlementError) {
        setQuotaError(result.entitlementError);
        return;
      }
      setMessage(friendlyError(result.body.error as string | undefined, t));
      return;
    }
    router.push(`/app/biens/${result.body.propertyId}`);
    router.refresh();
  }

  return (
    <div className="page-stack demo-narrow form-page-v2">
      <Link className="demo-back" href="/app/biens"><ArrowLeft size={17} />{t("Retour aux biens", "Back to properties")}</Link>
      <PageHeader
        eyebrow={t("Biens", "Properties")}
        title={t("Ajouter un bien", "Add property")}
        description={t("Trois informations suffisent pour commencer.", "Three details are enough to get started.")}
      />
      <LiveDataNotice />
      <Card>
        <form className="form-stack" onSubmit={submit}>
          <label className="field"><span>{t("Nom / repère", "Name / reference")}</span><input name="name" minLength={2} maxLength={120} required placeholder={t("Ex. Maison Bonapriso", "E.g. Bonapriso House")} /></label>
          <label className="field"><span>{t("Ville / localité", "City / locality")}</span><input name="locality" minLength={2} maxLength={160} required placeholder={t("Ex. Douala · Bonapriso", "E.g. Douala · Bonapriso")} /></label>
          <label className="field"><span>{t("Type", "Type")}</span><select value={type} onChange={(event) => setType(event.target.value as PropertyType)}><option value="house">{t("Maison", "House")}</option><option value="building">{t("Immeuble", "Building")}</option></select></label>
          {type === "house" ? <><label className="field"><span>{t("Loyer mensuel de référence (XAF) — facultatif", "Monthly reference rent (XAF) — optional")}</span><input inputMode="numeric" min="1" placeholder={t("Ex. 75 000", "E.g. 75,000")} type="number" value={referenceRentXaf} onChange={(event) => setReferenceRentXaf(event.target.value)} /><small>{t("Cette suggestion sera enregistrée sur l’unité « Maison entière ».", "This suggestion will be saved on the “Whole house” unit.")}</small></label><p className="demo-hint">{t("L’unité « Maison entière » sera créée automatiquement et sans doublon.", "The “Whole house” unit will be created automatically without duplicates.")}</p></> : null}
          <button className="button button--primary" disabled={busy} type="submit">{busy ? t("Création…", "Creating…") : t("Créer le bien", "Create property")}</button>
          {message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}
        </form>
      </Card>
      {quotaError ? <QuotaLimitModal error={quotaError} language={language} onClose={() => setQuotaError(null)} /> : null}
    </div>
  );
}

export function PropertyDetailView({
  property,
  canManageProperty,
  canManageUnits,
}: {
  property: PropertyDetail;
  canManageProperty: boolean;
  canManageUnits: boolean;
}) {
  const t = useCopy();
  const { language } = usePreferences();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState<EntitlementError | null>(null);

  async function updateProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const result = await mutate({ action: "update_property", propertyId: property.id, name: form.get("name"), locality: form.get("locality") });
    setBusy(false);
    if (!result.ok) return setMessage(friendlyError(result.body.error as string | undefined, t));
    setEditing(false);
    setMessage(t("Bien modifié.", "Property updated."));
    router.refresh();
  }

  async function addUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const result = await mutate({ action: "create_unit", propertyId: property.id, label: form.get("label"), type: form.get("type"), areaSqm: form.get("areaSqm"), referenceRentXaf: form.get("referenceRentXaf") });
    setBusy(false);
    if (!result.ok) {
      if (result.entitlementError) return setQuotaError(result.entitlementError);
      return setMessage(friendlyError(result.body.error as string | undefined, t));
    }
    setAdding(false);
    setMessage(t("Unité ajoutée.", "Unit added."));
    router.refresh();
  }

  async function archiveProperty() {
    if (!window.confirm(t("Archiver ce bien et toutes ses unités ?", "Archive this property and all its units?"))) return;
    setBusy(true);
    const result = await mutate({ action: "archive_property", propertyId: property.id });
    setBusy(false);
    if (!result.ok) return setMessage(friendlyError(result.body.error as string | undefined, t));
    router.push("/app/biens");
    router.refresh();
  }

  const vacant = property.units.filter((unit) => unit.occupancy === "vacant").length;
  return (
    <div className="page-stack resource-detail-v2 property-detail-v2">
      <Link className="demo-back" href="/app/biens"><ArrowLeft size={17} />{t("Tous les biens", "All properties")}</Link>
      <PageHeader
        eyebrow={propertyLabel(property.type, t)}
        title={property.name}
        description={property.locality}
        action={canManageProperty ? <button className="button button--secondary" onClick={() => setEditing((value) => !value)} type="button"><Pencil size={17} />{t("Modifier", "Edit")}</button> : undefined}
      />
      <LiveDataNotice />
      {message ? <p className="form-feedback" role="status">{message}</p> : null}
      {editing ? (
        <Card>
          <form className="form-stack" onSubmit={updateProperty}>
            <label className="field"><span>{t("Nom / repère", "Name / reference")}</span><input defaultValue={property.name} maxLength={120} minLength={2} name="name" required /></label>
            <label className="field"><span>{t("Ville / localité", "City / locality")}</span><input defaultValue={property.locality} maxLength={160} minLength={2} name="locality" required /></label>
            <div className="fixed-configuration"><span><small>{t("Type", "Type")}</small><strong>{propertyLabel(property.type, t)}</strong></span><span><small>{t("Règle MVP", "MVP rule")}</small><strong>{t("Type conservé", "Type preserved")}</strong></span></div>
            <p className="demo-hint">{t("Le type reste fixe pour préserver la hiérarchie des unités existantes.", "The type stays fixed to preserve the existing unit hierarchy.")}</p>
            <div className="demo-form-actions"><button className="button button--primary" disabled={busy} type="submit">{t("Enregistrer", "Save")}</button><button className="button button--secondary" onClick={() => setEditing(false)} type="button">{t("Annuler", "Cancel")}</button></div>
          </form>
        </Card>
      ) : null}
      <section className="property-photo-placeholder" aria-label={t("Photo principale à venir", "Primary photo coming later")}><ImageIcon aria-hidden="true" size={25} /><div><strong>{t("Photo principale facultative", "Optional primary photo")}</strong><span>{t("L’upload sera ajouté dans un lot Storage dédié.", "Upload will be added in a dedicated Storage lot.")}</span></div></section>
      <section className="demo-summary-grid">
        <Card><strong className="demo-summary-value">{property.units.length}</strong><span>{t("Unités", "Units")}</span></Card>
        <Card><strong className="demo-summary-value">{vacant}</strong><span>{t("Vacantes", "Vacant")}</span></Card>
        <Card><strong className="demo-summary-value">{property.units.length - vacant}</strong><span>{t("Occupées", "Occupied")}</span></Card>
      </section>
      {adding ? (
        <Card>
          <form className="form-grid" onSubmit={addUnit}>
            <label className="field"><span>{t("Repère de l’unité", "Unit reference")}</span><input name="label" maxLength={120} required placeholder={t("Ex. Appartement A3", "E.g. Apartment A3")} /></label>
            <label className="field"><span>{t("Type", "Type")}</span><select name="type" defaultValue="apartment"><option value="apartment">{t("Appartement", "Apartment")}</option><option value="studio">Studio</option><option value="room">{t("Chambre", "Room")}</option><option value="shop">{t("Boutique", "Shop")}</option><option value="office">{t("Bureau / local", "Office / commercial unit")}</option></select></label>
            <label className="field"><span>{t("Superficie en m² (facultatif)", "Area in m² (optional)")}</span><input inputMode="decimal" min="0.01" name="areaSqm" step="0.01" type="number" /></label>
            <label className="field"><span>{t("Loyer mensuel de référence (XAF) — facultatif", "Monthly reference rent (XAF) — optional")}</span><input inputMode="numeric" min="1" name="referenceRentXaf" placeholder={t("Ex. 50 000", "E.g. 50,000")} type="number" /><small>{t("Suggestion modifiable lors de la création d’une location.", "Editable suggestion when creating a lease.")}</small></label>
            <div className="demo-form-actions"><button className="button button--primary" disabled={busy} type="submit">{t("Ajouter", "Add")}</button><button className="button button--secondary" onClick={() => setAdding(false)} type="button">{t("Annuler", "Cancel")}</button></div>
          </form>
        </Card>
      ) : null}
      <Card>
        <div className="section-heading">
          <div><p className="eyebrow">{t("Logements", "Units")}</p><h2>{t("Logements et unités", "Units and spaces")}</h2></div>
          {canManageUnits && property.type === "building" ? <button className="button button--primary" onClick={() => setAdding(true)} type="button"><Plus size={17} />{t("Ajouter une unité", "Add unit")}</button> : null}
        </div>
        {property.units.length ? (
          <div className="demo-list">
            {property.units.map((unit) => <UnitRow propertyId={property.id} unit={unit} key={unit.id} />)}
          </div>
        ) : <EmptyState title={t("Aucune unité", "No units")} description={t("Ajoutez le premier espace louable.", "Add the first rentable space.")} />}
      </Card>
      {canManageProperty ? <div className="resource-danger-zone"><button className="button button--danger" disabled={busy} onClick={archiveProperty} type="button"><Archive size={17} />{t("Archiver le bien", "Archive property")}</button><p>{t("Les unités seront archivées avec le bien. Aucune suppression physique n’est effectuée.", "Units will be archived with the property. Nothing is physically deleted.")}</p></div> : null}
      {quotaError ? <QuotaLimitModal error={quotaError} language={language} onClose={() => setQuotaError(null)} /> : null}
    </div>
  );
}

function UnitRow({ propertyId, unit }: { propertyId: string; unit: UnitRecord }) {
  const t = useCopy();
  return (
    <Link href={`/app/biens/${propertyId}/unites/${unit.id}`} className="demo-list-row">
      <span className="demo-list-row__icon"><Home size={19} /></span>
      <div><strong>{unit.label}</strong><span>{unitLabel(unit.type, t)}{unit.areaSqm ? ` · ${unit.areaSqm} m²` : ""}{unit.referenceRentXaf ? ` · ${money(unit.referenceRentXaf)}` : ""}</span></div>
      <Badge tone={unit.occupancy === "occupied" ? "success" : "neutral"}>{unit.occupancy === "occupied" ? t("Occupée", "Occupied") : t("Vacante", "Vacant")}</Badge>
      <ChevronRight size={18} />
    </Link>
  );
}

export function UnitDetailView({
  property,
  unit,
  canManage,
  canManageLease,
}: {
  property: { id: string; name: string; type: PropertyType };
  unit: UnitRecord;
  canManage: boolean;
  canManageLease: boolean;
}) {
  const t = useCopy();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function updateUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const result = await mutate({ action: "update_unit", propertyId: property.id, unitId: unit.id, label: form.get("label"), type: form.get("type"), areaSqm: form.get("areaSqm"), referenceRentXaf: form.get("referenceRentXaf") });
    setBusy(false);
    if (!result.ok) return setMessage(friendlyError(result.body.error as string | undefined, t));
    setEditing(false);
    setMessage(t("Unité modifiée.", "Unit updated."));
    router.refresh();
  }

  async function archiveUnit() {
    if (!window.confirm(t("Archiver cette unité ?", "Archive this unit?"))) return;
    setBusy(true);
    const result = await mutate({ action: "archive_unit", propertyId: property.id, unitId: unit.id });
    setBusy(false);
    if (!result.ok) return setMessage(friendlyError(result.body.error as string | undefined, t));
    router.push(`/app/biens/${property.id}`);
    router.refresh();
  }

  return (
    <div className="page-stack resource-detail-v2 unit-detail-v2">
      <Link className="demo-back" href={`/app/biens/${property.id}`}><ArrowLeft size={17} />{property.name}</Link>
      <PageHeader
        eyebrow={t("Logement", "Unit")}
        title={unit.label}
        description={`${property.name} · ${unitLabel(unit.type, t)}`}
        action={canManage ? <button className="button button--secondary" onClick={() => setEditing((value) => !value)} type="button"><Pencil size={17} />{t("Modifier", "Edit")}</button> : undefined}
      />
      <LiveDataNotice />
      {message ? <p className="form-feedback" role="status">{message}</p> : null}
      {editing ? (
        <Card>
          <form className="form-stack" onSubmit={updateUnit}>
            <label className="field"><span>{t("Repère", "Reference")}</span><input defaultValue={unit.label} maxLength={120} name="label" required /></label>
            {unit.type === "whole_house" ? <input name="type" type="hidden" value="whole_house" /> : <label className="field"><span>{t("Type", "Type")}</span><select defaultValue={unit.type} name="type"><option value="apartment">{t("Appartement", "Apartment")}</option><option value="studio">Studio</option><option value="room">{t("Chambre", "Room")}</option><option value="shop">{t("Boutique", "Shop")}</option><option value="office">{t("Bureau / local", "Office / commercial unit")}</option></select></label>}
            <label className="field"><span>{t("Superficie en m² (facultatif)", "Area in m² (optional)")}</span><input defaultValue={unit.areaSqm ?? ""} inputMode="decimal" min="0.01" name="areaSqm" step="0.01" type="number" /></label>
            <label className="field"><span>{t("Loyer mensuel de référence (XAF) — facultatif", "Monthly reference rent (XAF) — optional")}</span><input defaultValue={unit.referenceRentXaf ?? ""} inputMode="numeric" min="1" name="referenceRentXaf" placeholder={t("Ex. 40 000", "E.g. 40,000")} type="number" /><small>{t("Cette valeur suggère le loyer des nouveaux baux sans modifier les contrats existants.", "This suggests rent for new leases without changing existing contracts.")}</small></label>
            <div className="demo-form-actions"><button className="button button--primary" disabled={busy} type="submit">{t("Enregistrer", "Save")}</button><button className="button button--secondary" onClick={() => setEditing(false)} type="button">{t("Annuler", "Cancel")}</button></div>
          </form>
        </Card>
      ) : null}
      <Card className="demo-detail-card signature-surface signature-surface--right">
        <div><Badge tone={unit.occupancy === "occupied" ? "success" : "neutral"}>{unit.occupancy === "occupied" ? t("Occupée", "Occupied") : t("Vacante", "Vacant")}</Badge><h2>{unit.occupancy === "occupied" ? t("Unité occupée", "Occupied unit") : t("Unité vacante", "Vacant unit")}</h2><p>{unit.occupancy === "occupied" ? t(`${unit.activeTenantName ?? "Locataire"} · occupation dérivée de la location active.`, `${unit.activeTenantName ?? "Tenant"} · occupancy derived from the active lease.`) : t("Aucune location active n’est associée.", "No active lease is linked.")}</p>{unit.areaSqm ? <p><strong>{unit.areaSqm} m²</strong></p> : null}<p><strong>{unit.referenceRentXaf ? money(unit.referenceRentXaf) : t("Aucun loyer de référence", "No reference rent")}</strong><br /><small>{t("Suggestion Unit — indépendante de tout loyer contractuel.", "Unit suggestion — independent from contractual rent.")}</small></p></div>
        {unit.activeLeaseId ? <Link className="button button--secondary" href={`/app/locations/${unit.activeLeaseId}`}>{t("Ouvrir la location", "Open lease")}</Link> : canManageLease ? <Link className="button button--primary" href={`/app/locations/nouveau?unit=${unit.id}`}>{t("Créer une location", "Create lease")}</Link> : null}
      </Card>
      {canManage ? <div className="resource-danger-zone"><button className="button button--danger" disabled={busy} onClick={archiveUnit} type="button"><Archive size={17} />{t("Archiver l’unité", "Archive unit")}</button><p>{t("L’unité disparaîtra des listes actives sans être supprimée physiquement.", "The unit will leave active lists without being physically deleted.")}</p></div> : null}
    </div>
  );
}

export function MissingPropertyResource() {
  const t = useCopy();
  return <div className="page-stack"><Card><EmptyState title={t("Ressource introuvable ou inaccessible", "Resource not found or unavailable")} description={t("Vérifiez l’Organization active ou revenez à la liste des biens.", "Check the active Organization or return to the property list.")} action={<Link className="button button--primary" href="/app/biens">{t("Voir les biens", "View properties")}</Link>} /></Card></div>;
}
