"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";

export type RecordTab = { id: string; label: string; content: ReactNode };

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

// Onglets d'une fiche (location, locataire…). Tous les panneaux restent rendus (les formulaires gardent
// leur état) ; seul le panneau actif est visible. Un lien vers une ancre (#corriger-loyer) ouvre
// automatiquement le bon onglet.
export function RecordTabs({ tabs, label }: { tabs: RecordTab[]; label: string }) {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash.slice(1), () => "");
  const [chosen, setChosen] = useState<string | null>(null);
  const fromHash = (() => {
    if (!hash) return null;
    if (tabs.some((tab) => tab.id === hash)) return hash;
    if (typeof document === "undefined") return null;
    return document.getElementById(hash)?.closest<HTMLElement>("[data-tab-panel]")?.dataset.tabPanel ?? null;
  })();
  const active = chosen ?? fromHash ?? tabs[0]?.id;
  return (
    <div className="record-tabs-v2">
      <div aria-label={label} className="record-tabs-v2__bar" role="tablist">
        {tabs.map((tab) => (
          <button aria-controls={`panel-${tab.id}`} aria-selected={tab.id === active} className={`record-tabs-v2__tab${tab.id === active ? " record-tabs-v2__tab--active" : ""}`} id={`tab-${tab.id}`} key={tab.id} onClick={() => setChosen(tab.id)} role="tab" type="button">{tab.label}</button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div aria-labelledby={`tab-${tab.id}`} className="record-tabs-v2__panel" data-tab-panel={tab.id} hidden={tab.id !== active} id={`panel-${tab.id}`} key={tab.id} role="tabpanel">{tab.content}</div>
      ))}
    </div>
  );
}
