"use client";

import { Languages, Moon, Sun } from "lucide-react";
import { usePreferences } from "./preferences-provider";

export function PreferencesControls({ compact = false }: { compact?: boolean }) {
  const { theme, language, toggleLanguage, toggleTheme } = usePreferences();

  return (
    <div className={compact ? "preference-controls preference-controls--compact" : "preference-controls"}>
      <button className="control-button" type="button" onClick={toggleLanguage}>
        <Languages aria-hidden="true" size={18} strokeWidth={1.8} />
        <span>{language}</span>
      </button>
      <button
        aria-label={theme === "light" ? "Activer le thème sombre" : "Activer le thème clair"}
        className="control-button"
        type="button"
        onClick={toggleTheme}
      >
        {theme === "light" ? (
          <Moon aria-hidden="true" size={18} strokeWidth={1.8} />
        ) : (
          <Sun aria-hidden="true" size={18} strokeWidth={1.8} />
        )}
        {!compact ? <span>{theme === "light" ? "Sombre" : "Clair"}</span> : null}
      </button>
    </div>
  );
}
