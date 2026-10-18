import Link from "next/link";
import { EDITEUR_NOM, MARQUE_NOM, PRODUIT_NOM } from "@/core/legal/legal-facts";

export function PublicFooter({ locale = "fr" }: { locale?: "fr" | "en" }) {
  const english = locale === "en";
  const local = (path: string) => `${path}?locale=${locale}`;
  return (
    <footer className="public-footer">
      <nav aria-label={english ? "Public, help and legal links" : "Liens publics, aide et informations légales"}>
        <Link href={local("/")}>{english ? "Home" : "Accueil"}</Link>
        <Link href={`/aide?locale=${locale}`}>{english ? "Help" : "Aide"}</Link>
        <Link href={`/contact?locale=${locale}`}>Contact</Link>
        <Link href={local("/partenaires")}>{english ? "Partners" : "Partenaires"}</Link>
        <Link href={local("/connexion")}>{english ? "Owner sign in" : "Connexion propriétaire"}</Link>
        <Link href={local("/portal/connexion")}>{english ? "Tenant portal" : "Portail locataire"}</Link>
        <Link href={`/securite?locale=${locale}`}>{english ? "Security" : "Sécurité"}</Link>
        <Link href={`/confidentialite?locale=${locale}`}>{english ? "Privacy" : "Confidentialité"}</Link>
        <Link href={`/mentions-legales?locale=${locale}`}>{english ? "Legal notice" : "Mentions légales"}</Link>
        <Link href={local("/conditions-abonnement")}>{english ? "Subscription terms" : "Conditions d'abonnement"}</Link>
      </nav>
      <p>{PRODUIT_NOM} — {MARQUE_NOM}, {english ? `digital and SaaS activity of ${EDITEUR_NOM}. Beta.` : `activité numérique et SaaS de ${EDITEUR_NOM}. Bêta.`}</p>
    </footer>
  );
}
