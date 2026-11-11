"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

// Tiroir latéral (panneau à droite sur ordinateur, feuille qui monte du bas sur mobile).
// Il se ferme avec la croix, la touche Échap ou un clic sur le fond. Le contenu de la page
// derrière reste en place : on ne quitte jamais la page d'origine.
export function SideDrawer({ open, title, subtitle, onClose, headerAction, children }: {
  open: boolean; title: string; subtitle?: string; onClose: () => void; headerAction?: ReactNode; children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="side-drawer" role="presentation">
      <button aria-label="Fermer le panneau" className="side-drawer__backdrop" onClick={onClose} tabIndex={-1} type="button" />
      <div aria-label={title} aria-modal="true" className="side-drawer__panel" ref={panelRef} role="dialog" tabIndex={-1}>
        <header className="side-drawer__header">
          <div className="side-drawer__titles">
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {headerAction}
          <button aria-label="Fermer" className="icon-button" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button>
        </header>
        <div className="side-drawer__body">{children}</div>
      </div>
    </div>
  );
}
