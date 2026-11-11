// Quand une page /app est affichée dans un tiroir (iframe de la même origine), on masque le menu,
// l'en-tête et la barre du bas pour ne garder que le contenu. Le script s'exécute avant l'affichage
// pour éviter tout clignotement ; il ne fait rien dans une fenêtre normale.
const SCRIPT = "try{if(window.self!==window.top){document.documentElement.classList.add('is-embedded')}}catch(e){document.documentElement.classList.add('is-embedded')}";

export function EmbeddedMarker() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
