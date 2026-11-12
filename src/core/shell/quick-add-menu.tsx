"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Building2, KeyRound, Plus, UserRoundPlus, WalletCards } from "lucide-react";
import { hasCapability, type Capability } from "@/core/authorization/capabilities";

const ITEMS: Array<{ href: string; label: string; icon: typeof Plus; capability: Capability }> = [
  { href: "/app/paiements/nouveau", label: "Enregistrer un paiement", icon: WalletCards, capability: "payment.record" },
  { href: "/app/locataires/nouveau", label: "Nouveau locataire", icon: UserRoundPlus, capability: "tenant.manage" },
  { href: "/app/locations/nouveau", label: "Nouvelle location", icon: KeyRound, capability: "lease.manage" },
  { href: "/app/biens/nouveau", label: "Nouveau bien", icon: Building2, capability: "property.manage" },
];

// Bouton « + Ajouter » toujours visible : les créations courantes à un clic, selon les droits.
export function QuickAddMenu({ capabilities, compact = false }: { capabilities: readonly Capability[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const items = ITEMS.filter((item) => hasCapability(capabilities, item.capability));
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  if (!items.length) return null;
  return (
    <div className="quick-add" ref={ref}>
      <button aria-expanded={open} aria-haspopup="menu" aria-label="Ajouter" className={compact ? "icon-button quick-add__trigger--compact" : "button button--primary quick-add__trigger"} onClick={() => setOpen((value) => !value)} type="button">
        <Plus aria-hidden="true" size={18} />{compact ? null : "Ajouter"}
      </button>
      {open ? <div className="quick-add__menu" role="menu">
        {items.map((item) => { const Icon = item.icon; return <Link href={item.href} key={item.href} onClick={() => setOpen(false)} role="menuitem"><Icon aria-hidden="true" size={17} />{item.label}</Link>; })}
      </div> : null}
    </div>
  );
}
