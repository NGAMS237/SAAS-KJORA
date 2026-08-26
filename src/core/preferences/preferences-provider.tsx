"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type Theme = "light" | "dark";
type Language = "FR" | "EN";

type PreferencesContextValue = {
  theme: Theme;
  language: Language;
  toggleTheme: () => void;
  toggleLanguage: () => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [language, setLanguage] = useState<Language>("FR");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("kjora-demo-theme", theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      language,
      toggleTheme: () => setTheme((current) => (current === "light" ? "dark" : "light")),
      toggleLanguage: () => setLanguage((current) => (current === "FR" ? "EN" : "FR")),
    }),
    [language, theme],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) {
    throw new Error("usePreferences must be used within PreferencesProvider");
  }
  return value;
}
