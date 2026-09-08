import Link from "next/link";

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
      <p>Kjora — gestion locative. Bêta.</p>
    </footer>
  );
}
