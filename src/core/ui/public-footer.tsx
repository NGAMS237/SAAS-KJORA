import Link from "next/link";
import { EDITEUR_NOM, MARQUE_NOM, PRODUIT_NOM } from "@/core/legal/legal-facts";

// Footer des surfaces publiques. Volontairement discret : il ne fait pas partie
// de la navigation principale et n'alourdit aucun parcours.
export function PublicFooter({ locale = "fr" }: { locale?: "fr" | "en" }) {
  const english = locale === "en";
  return (
    <footer className="public-footer">
      <nav aria-label={english ? "Help and legal information" : "Aide et informations légales"}>
        <Link href={`/aide?locale=${locale}`}>{english ? "Help" : "Aide"}</Link>
        <Link href={`/contact?locale=${locale}`}>Contact</Link>
        <details className="public-footer__legal">
          <summary>{english ? "Legal information" : "Informations légales"}</summary>
          <Link href={`/securite?locale=${locale}`}>{english ? "Security" : "Sécurité"}</Link>
          <Link href={`/confidentialite?locale=${locale}`}>{english ? "Privacy" : "Confidentialité"}</Link>
          <Link href={`/mentions-legales?locale=${locale}`}>{english ? "Legal notice" : "Mentions légales"}</Link>
        </details>
      </nav>
      <p>
        {PRODUIT_NOM} — {MARQUE_NOM}, {english ? `digital and SaaS activity of ${EDITEUR_NOM}. Beta.` : `activité numérique et SaaS de ${EDITEUR_NOM}. Bêta.`}
      </p>
    </footer>
  );
}
