"use client";

import { useMemo, useState } from "react";
import { Copy, Mail, MessageCircle, MessagesSquare } from "lucide-react";
import { Card } from "@/core/ui/ui";
import { buildWhatsAppUrl } from "./manual-whatsapp";
import { MESSAGE_TEMPLATES, buildMailtoUrl, firstName, formatXaf, normalizeTenantPhone, renderTemplate, templateByKey } from "./message-templates";

export type MessageTenant = {
  id: string; fullName: string; phone: string | null; email: string | null;
  unitLabel: string | null; baseRentXaf: number; chargesXaf: number; dueDay: number | null; amountDueXaf: number;
};

const GROUPS: Array<{ id: "loyer" | "vie_du_bail" | "occasions"; label: string }> = [
  { id: "loyer", label: "Loyer" }, { id: "vie_du_bail", label: "Vie du bail" }, { id: "occasions", label: "Occasions" },
];

export function MessagesView({ tenants }: { tenants: MessageTenant[] }) {
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? "");
  const [templateKey, setTemplateKey] = useState("rappel_avant");
  const [signature, setSignature] = useState("Cordialement.");
  const [extra, setExtra] = useState({ date: "", nouveau_loyer: "" });
  const [edited, setEdited] = useState<string | null>(null);
  const [phoneOverride, setPhoneOverride] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const tenant = tenants.find((item) => item.id === tenantId) ?? null;
  const template = templateByKey(templateKey);
  const generated = useMemo(() => {
    if (!tenant) return "";
    return renderTemplate(template.body, {
      prenom: firstName(tenant.fullName), nom: tenant.fullName, logement: tenant.unitLabel ?? "",
      loyer: formatXaf(tenant.baseRentXaf), charges: formatXaf(tenant.chargesXaf), total: formatXaf(tenant.baseRentXaf + tenant.chargesXaf),
      du: tenant.amountDueXaf > 0 ? formatXaf(tenant.amountDueXaf) : "", jour: tenant.dueDay ? String(tenant.dueDay) : "",
      date: extra.date, nouveau_loyer: extra.nouveau_loyer ? formatXaf(Number(extra.nouveau_loyer) || 0) : "", signature,
    });
  }, [tenant, template, extra, signature]);
  const text = edited ?? generated;
  const phone = phoneOverride !== null ? normalizeTenantPhone(phoneOverride) : normalizeTenantPhone(tenant?.phone);
  const whatsappUrl = phone ? buildWhatsAppUrl(phone, text) : null;
  const mailUrl = tenant?.email ? buildMailtoUrl(tenant.email, template.subject || "Message", text) : null;

  function reset() { setEdited(null); setCopied(false); }

  if (!tenants.length) return <Card><p>Aucun locataire avec un bail actif pour l’instant.</p></Card>;

  return (
    <>
      <div className="section-heading"><div><p className="eyebrow">Communication</p><h1>Messages</h1></div><MessagesSquare size={22} /></div>
      <Card>
        <p className="field-help">Choisissez un locataire et une occasion : le message se remplit avec ses informations. Relisez-le, modifiez-le si besoin, puis ouvrez WhatsApp ou votre messagerie. Rien n’est envoyé sans votre clic.</p>
        <div className="form-stack">
          <label className="field"><span>Locataire</span>
            <select onChange={(event) => { setTenantId(event.target.value); setPhoneOverride(null); reset(); }} value={tenantId}>
              {tenants.map((item) => <option key={item.id} value={item.id}>{item.fullName}{item.unitLabel ? ` — ${item.unitLabel}` : ""}{item.amountDueXaf > 0 ? ` (doit ${formatXaf(item.amountDueXaf)})` : ""}</option>)}
            </select>
          </label>
          <label className="field"><span>Occasion</span>
            <select onChange={(event) => { setTemplateKey(event.target.value); reset(); }} value={templateKey}>
              {GROUPS.map((group) => <optgroup key={group.id} label={group.label}>{MESSAGE_TEMPLATES.filter((item) => item.group === group.id).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</optgroup>)}
            </select>
          </label>
          {template.body.includes("{date}") ? <label className="field"><span>Date (à indiquer dans le message)</span><input onChange={(event) => { setExtra({ ...extra, date: event.target.value }); reset(); }} placeholder="ex. 1er décembre 2026" value={extra.date} /></label> : null}
          {template.body.includes("{nouveau_loyer}") ? <label className="field"><span>Nouveau loyer (XAF)</span><input inputMode="numeric" onChange={(event) => { setExtra({ ...extra, nouveau_loyer: event.target.value.replace(/\D/g, "") }); reset(); }} value={extra.nouveau_loyer} /></label> : null}
          <label className="field"><span>Signature</span><input onChange={(event) => { setSignature(event.target.value); reset(); }} value={signature} /></label>
          <label className="field"><span>Message (modifiable)</span><textarea onChange={(event) => setEdited(event.target.value)} rows={7} value={text} /></label>
          {edited !== null ? <button className="button button--secondary" onClick={reset} type="button">Revenir au modèle</button> : null}
          <label className="field"><span>Numéro WhatsApp</span>
            <input onChange={(event) => setPhoneOverride(event.target.value)} placeholder="ex. 6 53 32 99 08" value={phoneOverride ?? tenant?.phone ?? ""} />
            <small>{phone ? `Sera utilisé : ${phone}` : "Numéro non reconnu : ajoutez l’indicatif, par exemple +237 6XX XX XX XX."}</small>
          </label>
          <div className="demo-form-actions">
            {whatsappUrl ? <a className="button button--primary" href={whatsappUrl} rel="noopener noreferrer" target="_blank"><MessageCircle size={15} /> Ouvrir WhatsApp</a> : <button className="button button--primary" disabled type="button"><MessageCircle size={15} /> Ouvrir WhatsApp</button>}
            {mailUrl ? <a className="button button--secondary" href={mailUrl}><Mail size={15} /> Écrire par e-mail</a> : <button className="button button--secondary" disabled title="Ce locataire n’a pas d’e-mail" type="button"><Mail size={15} /> {tenant?.email ? "E-mail invalide" : "Pas d’e-mail"}</button>}
            <button className="button button--secondary" onClick={() => { void navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => null); }} type="button"><Copy size={15} /> {copied ? "Copié" : "Copier"}</button>
          </div>
          {text.includes("[") ? <p className="field-help">Les éléments entre crochets sont à compléter avant l’envoi.</p> : null}
        </div>
      </Card>
    </>
  );
}
