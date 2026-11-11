import Link from "next/link";
import { PublicFooter } from "@/core/ui/public-footer";
import { FORMULATION_CANONIQUE } from "@/core/legal/legal-facts";

export const metadata = {
  title: "Contact",
  description: "Joindre l’équipe Kjora.",
};

const SUPPORT_MAILTO = process.env.NEXT_PUBLIC_KJORA_CONTACT_EMAIL ?? "";

// Page publique et factuelle. Aucune promesse de délai contractuel, aucune
// mention de conformité juridique : ces éléments relèvent d'une revue légale.
export default function ContactPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel auth-panel--wide">
        <Link className="wordmark wordmark--auth" href="/">Kjora<span>.</span></Link>
        <p className="eyebrow">Contact</p>
        <h1>Nous joindre</h1>
        <p className="auth-intro">
          Kjora est en bêta. Nous lisons chaque message et répondons généralement sous un jour ouvré.
        </p>
        <p className="auth-intro">{FORMULATION_CANONIQUE}</p>

        <div className="aide-bloc">
          <h2>Vous utilisez déjà Kjora</h2>
          <p>
            Le plus efficace est d’écrire depuis votre espace :{" "}
            <Link href="/app/support">Support</Link>. Votre organisation et votre rôle nous sont
            transmis automatiquement, ce qui évite les allers-retours.
          </p>
        </div>

        <div className="aide-bloc">
          <h2>Vous n’arrivez pas à vous connecter</h2>
          <p>
            Consultez d’abord la page <Link href="/aide">Aide</Link> : elle couvre la quasi-totalité des
            problèmes de lien de connexion.
          </p>
          {SUPPORT_MAILTO ? (
            <p>
              Si le problème persiste : <a href={`mailto:${SUPPORT_MAILTO}`}>{SUPPORT_MAILTO}</a>
            </p>
          ) : null}
        </div>

        <div className="aide-bloc">
          <h2>Vous représentez une agence ou un groupe</h2>
          <p>
            Les besoins sur mesure — volumes importants, plusieurs organisations, intégrations — passent
            par un échange commercial plutôt que par l’inscription libre.
          </p>
        </div>

        <p className="auth-footnote">
          Ne nous transmettez jamais un mot de passe ni un code d’accès reçu par email.
        </p>
        <PublicFooter />
      </section>
    </main>
  );
}
