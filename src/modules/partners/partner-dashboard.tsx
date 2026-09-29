"use client";

import { useState } from "react";

type PartnerCode = { code: string; status: string; campaign: string | null };
type PartnerDashboardData = {
  displayName: string; status: string; type: string; attributions: number;
  codes: PartnerCode[]; rewards: Record<string, number>;
};

export function PartnerDashboardView({ data, commercialSiteUrl }: { data: PartnerDashboardData; commercialSiteUrl: string | null }) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1800);
  }
  return <main className="auth-page"><section className="auth-panel partner-panel">
    <p className="eyebrow">KJORA Partners</p><h1>{data.displayName}</h1>
    <p>Statut / Status: <strong>{data.status}</strong> · Profil / Profile: <strong>{data.type}</strong></p>
    <section aria-labelledby="partner-links"><h2 id="partner-links">Codes et liens / Codes & links</h2>
      {data.codes.length ? <ul className="partner-code-list">{data.codes.map((item) => {
        const link = commercialSiteUrl ? `${commercialSiteUrl}?partner=${encodeURIComponent(item.code)}` : null;
        return <li key={item.code}><div><strong>{item.code}</strong><span>{item.campaign ?? "KJORA"} · {item.status}</span></div>
          <div className="admin-actions-row"><button className="button button--secondary" onClick={() => copy(item.code, `code:${item.code}`)} type="button">Copier le code / Copy code</button>
          {link ? <button className="button button--secondary" onClick={() => copy(link, `link:${item.code}`)} type="button">Copier le lien / Copy link</button> : null}</div>
          {copied?.endsWith(item.code) ? <p role="status">Copié / Copied</p> : null}
        </li>;
      })}</ul> : <p>Aucun code actif pour le moment. / No active code yet.</p>}
      {!commercialSiteUrl ? <p className="form-feedback">Le lien commercial sera disponible après configuration du domaine. Le code reste utilisable. / The referral link will be available after domain configuration. The code remains usable.</p> : null}
    </section>
    <section aria-labelledby="partner-activity"><h2 id="partner-activity">Activité / Activity</h2>
      <div className="admin-counters"><div className="admin-counter"><span className="admin-counter__value">{data.attributions}</span><span className="admin-counter__label">Attributions</span></div>
        {(["pending","approved","paid","cancelled"] as const).map((status) => <div className="admin-counter" key={status}><span className="admin-counter__value">{data.rewards[status] ?? 0}</span><span className="admin-counter__label">{status}</span></div>)}</div>
    </section>
    <p className="auth-footnote">Aucune donnée de loyer, locataire, contrat ou paiement privé n’est exposée. / No private rent, tenant, contract or payment data is exposed.</p>
  </section></main>;
}
