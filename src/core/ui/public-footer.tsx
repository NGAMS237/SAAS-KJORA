import Link from "next/link";
import { EDITEUR_NOM, MARQUE_NOM, PRODUIT_NOM } from "@/core/legal/legal-facts";

// Footer des surfaces publiques. Volontairement discret : il ne fait pas partie
// de la navigation principale et n'alourdit aucun parcours.
export function PublicFooter() {
  return (
    <footer className="public-footer">
      <nav aria-label="Liens légaux et aide">
        <Link href="/aide">Aide</Link>
        <Link href="/contact">Contact</Link>
        <Link href="/securite">Sécurité</Link>
        <Link href="/confidentialite">Confidentialité</Link>
        <Link href="/mentions-legales">Mentions légales</Link>
      </nav>
      <p>
        {PRODUIT_NOM} — {MARQUE_NOM}, activité numérique et SaaS de {EDITEUR_NOM}. Bêta.
      </p>
    </footer>
  );
}
