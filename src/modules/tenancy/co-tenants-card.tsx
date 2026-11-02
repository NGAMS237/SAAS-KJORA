"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Users } from "lucide-react";
import { Card } from "@/core/ui/ui";
import { usePreferences } from "@/core/preferences/preferences-provider";
import type { LeaseCoTenant } from "./co-tenants";

export function LeaseCoTenantsCard({ leaseId, holderTenantId, items, candidates, canManage }: {
  leaseId: string;
  holderTenantId: string;
  items: LeaseCoTenant[];
  candidates: Array<{ id: string; fullName: string }>;
  canManage: boolean;
}) {
  const { language } = usePreferences();
  const t = (fr: string, en: string) => (language === "FR" ? fr : en);
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const taken = new Set([holderTenantId, ...items.map((item) => item.tenantId)]);
  const options = candidates.filter((candidate) => !taken.has(candidate.id));

  async function send(payload: Record<string, string>) {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/tenancy/co-tenants", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setMessage(body.error === "duplicate_resource" ? t("Cette personne est déjà colocataire.", "This person is already a co-tenant.") : t("Action impossible pour le moment.", "Action unavailable right now."));
        return;
      }
      setSelected("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="colocataires">
      <div className="section-heading">
        <div><p className="eyebrow">{t("Occupants", "Occupants")}</p><h2>{t("Colocataires", "Co-tenants")}</h2></div>
        <Users size={22} />
      </div>
      <p className="field-help">{t("Le titulaire du bail reste seul responsable des échéances et des paiements. Les colocataires sont rattachés au même logement à titre d’occupants.", "The lease holder remains solely responsible for dues and payments. Co-tenants are linked to the same unit as occupants.")}</p>
      {items.length ? (
        <ul className="support-tips">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/app/locataires/${item.tenantId}`}>{item.fullName}</Link>
              {canManage ? <> <button className="button button--secondary" disabled={busy} onClick={() => void send({ action: "remove", coTenantId: item.id })} type="button">{t("Retirer", "Remove")}</button></> : null}
            </li>
          ))}
        </ul>
      ) : <p>{t("Aucun colocataire.", "No co-tenants.")}</p>}
      {canManage && options.length ? (
        <div className="demo-form-actions">
          <select aria-label={t("Ajouter un colocataire", "Add a co-tenant")} onChange={(event) => setSelected(event.target.value)} value={selected}>
            <option value="">{t("Choisir un locataire…", "Choose a tenant…")}</option>
            {options.map((option) => <option key={option.id} value={option.id}>{option.fullName}</option>)}
          </select>
          <button className="button button--primary" disabled={busy || !selected} onClick={() => void send({ action: "add", leaseId, tenantId: selected })} type="button">{t("Ajouter", "Add")}</button>
        </div>
      ) : null}
      {message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}
    </Card>
  );
}
