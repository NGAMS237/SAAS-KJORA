"use client";

// =============================================================================
// ALIGN-02 §16 — émission de l'événement auth_completed
// =============================================================================
// auth_completed signifie « une session est devenue active dans ce navigateur ».
// Le callback PKCE est une route serveur : elle ne peut pas émettre un événement
// client. Ce composant comble ce trou en émettant l'événement au premier rendu
// authentifié, une seule fois par session de navigateur.
//
// Aucune donnée sensible n'est manipulée : ni token, ni email, ni identifiant.
// =============================================================================

import { useEffect } from "react";
import { trackEvent } from "@/core/analytics/events";

const SESSION_FLAG = "kjora:auth_completed_emitted";

export function AuthCompletedTracker() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SESSION_FLAG)) return;
      window.sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      // sessionStorage indisponible (navigation privée, stockage bloqué) :
      // on émet quand même plutôt que de perdre l'événement.
    }
    trackEvent("auth_completed", {});
  }, []);

  return null;
}
