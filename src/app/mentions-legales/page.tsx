import Link from "next/link";
import { PublicFooter } from "@/core/ui/public-footer";
import { EDITEUR_FIELDS, PROCESSORS, LEGAL_REVIEW_REQUIRED } from "@/core/legal/legal-facts";

export const metadata = {
  title: "Mentions légales — Kjora",
  description: "Informations légales relatives au service Kjora.",
};

const CONTACT_EMAIL = process.env.NEXT_PUBLIC_KJORA_CONTACT_EMAIL ?? "";

export default function MentionsLegalesPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel auth-panel--wide legal-page">
        <Link className="wordmark wordmark--auth" href="/">Kjora<span>.</span></Link>
        <p className="eyebrow">Informations légales</p>
        <h1>Mentions légales</h1>

        <p className="legal-banner" role="note">
          <strong>{LEGAL_REVIEW_REQUIRED}</strong> — Kjora est en bêta contrôlée. Les informations
          d’identification de l’éditeur ci-dessous n’ont pas encore été établies et validées
          juridiquement. Elles doivent l’être avant toute ouverture commerciale au public.
        </p>

        <div className="aide-bloc">
          <h2>Éditeur du service</h2>
          <dl className="legal-list">
            {EDITEUR_FIELDS.map((champ) => (
              <div key={champ.libelle}>
                <dt>{champ.libelle}</dt>
                <dd>
                  {champ.valeur ?? (
                    <span className="legal-missing">{LEGAL_REVIEW_REQUIRED}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            Ces champs sont volontairement laissés vides : aucune information d’immatriculation,
            d’adresse ou de représentation légale n’est établie dans la documentation du projet. Nous
            préférons l’indiquer plutôt que d’afficher une mention approximative.
          </p>
        </div>

        <div className="aide-bloc">
          <h2>Contact</h2>
          {CONTACT_EMAIL ? (
            <p>
              Par email : <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </p>
          ) : (
            <p>
              Depuis votre espace, via <Link href="/app/support">le support intégré</Link>, ou depuis la{" "}
              <Link href="/contact">page contact</Link>.
            </p>
          )}
        </div>

        <div className="aide-bloc">
          <h2>Hébergement et infrastructure</h2>
          <p>
            Le service s’appuie sur les prestataires techniques suivants, seuls éléments
            d’infrastructure établis à ce jour :
          </p>
          <dl className="legal-list">
            {PROCESSORS.map((prestataire) => (
              <div key={prestataire.nom}>
                <dt>{prestataire.nom}</dt>
                <dd>
                  {prestataire.role}
                  {prestataire.localisation ? ` · ${prestataire.localisation}` : ""}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            Les coordonnées légales complètes de l’hébergeur doivent être ajoutées lors de la revue
            juridique.
          </p>
        </div>

        <div className="aide-bloc">
          <h2>Propriété intellectuelle</h2>
          <p>
            Le nom Kjora, l’interface et le code du service appartiennent à leur éditeur. Les données
            que vous saisissez — biens, locataires, baux, paiements, documents — restent les vôtres.
          </p>
        </div>

        <div className="aide-bloc">
          <h2>Données personnelles</h2>
          <p>
            Le traitement des données est décrit dans la{" "}
            <Link href="/confidentialite">politique de confidentialité</Link>. Les mesures techniques
            sont détaillées sur la page <Link href="/securite">Sécurité</Link>.
          </p>
        </div>

        <PublicFooter />
      </section>
    </main>
  );
}
