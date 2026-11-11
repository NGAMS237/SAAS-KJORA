"use client";

import { useEffect } from "react";

// Quand une page /app est affichée dans un tiroir (iframe de la même origine), on masque le menu,
// l'en-tête et la barre du bas pour ne garder que le contenu.
// On utilise un attribut data-* (et non une classe) : React réécrit l'attribut class de <html> à
// l'hydratation et effaçait la marque. Le script inline évite le clignotement avant l'affichage ;
// l'effet la repose si besoin.
const SCRIPT = "try{if(window.self!==window.top){document.documentElement.setAttribute('data-embedded','1')}}catch(e){document.documentElement.setAttribute('data-embedded','1')}";

export function EmbeddedMarker() {
  useEffect(() => {
    try { if (window.self !== window.top) document.documentElement.setAttribute("data-embedded", "1"); }
    catch { document.documentElement.setAttribute("data-embedded", "1"); }
  }, []);
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
