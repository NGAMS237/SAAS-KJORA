import Link from "next/link";
import { PublicFooter } from "@/core/ui/public-footer";
import {
  EDITEUR_FIELDS,
  EDITEUR_NOM,
  MARQUE_NOM,
  MARQUE_DESCRIPTION,
  PRODUIT_NOM,
  FORMULATION_CANONIQUE,
  PROCESSORS,
  LEGAL_REVIEW_REQUIRED,
  LEGAL_OPEN_ITEMS,
} from "@/core/legal/legal-facts";

export const metadata = {
  title: "Mentions légales",
  description: "Informations légales relatives au service Kjora.",
};

const CONTACT_EMAIL = process.env.NEXT_PUBLIC_KJORA_CONTACT_EMAIL ?? "";

export default function MentionsLegalesPage() {
  const etablis = EDITEUR_FIELDS.filter((champ) => champ.valeur !== null);
  const enRevue = EDITEUR_FIELDS.filter((champ) => champ.valeur === null);

  return (
    <main className="auth-page">
      <section className="auth-panel auth-panel--wide legal-page">
        <Link className="wordmark wordmark--auth" href="/">Kjora<span>.</span></Link>
        <p className="eyebrow">Informations légales</p>
        <h1>Mentions légales</h1>

        <p className="auth-intro">{FORMULATION_CANONIQUE}</p>

        <div className="aide-bloc">
          <h2>Éditeur du service</h2>
          <dl className="legal-list">
            {etablis.map((champ) => (
              <div key={champ.libelle}>
                <dt>{champ.libelle}</dt>
                <dd>{champ.valeur}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="aide-bloc">
          <h2>Marque et activité</h2>
          <dl className="legal-list">
            <div>
              <dt>{MARQUE_NOM}</dt>
              <dd>{MARQUE_DESCRIPTION}</dd>
            </div>
            <div>
              <dt>{PRODUIT_NOM}</dt>
              <dd>
                Produit SaaS de gestion locative, développé et exploité par {MARQUE_NOM}.
              </dd>
            </div>
          </dl>
          <p>
            {MARQUE_NOM} est une activité de {EDITEUR_NOM} et ne dispose pas d’une personnalité
            juridique distincte. L’éditeur juridique du service est {EDITEUR_NOM}.
          </p>
        </div>

        {enRevue.length ? (
          <div className="aide-bloc">
            <h2>Éléments en cours de revue juridique</h2>
            <dl className="legal-list">
              {enRevue.map((champ) => (
                <div key={champ.libelle}>
                  <dt>{champ.libelle}</dt>
                  <dd><span className="legal-missing">{LEGAL_REVIEW_REQUIRED}</span></dd>
                </div>
              ))}
            </dl>
            <p>
              Ces éléments ne sont pas encore arrêtés. Nous préférons l’indiquer plutôt que
              d’afficher une mention approximative.
            </p>
          </div>
        ) : null}

        <div className="aide-bloc">
          <h2>Contact</h2>
          {CONTACT_EMAIL ? (
            <p>Par email : <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
          ) : (
            <p>
              Depuis votre espace, via <Link href="/app/support">le support intégré</Link>, ou depuis
              la <Link href="/contact">page contact</Link>.
            </p>
          )}
        </div>

        <div className="aide-bloc">
          <h2>Hébergement et infrastructure</h2>
          <p>Le service s’appuie sur les prestataires techniques suivants :</p>
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
            Les coordonnées légales complètes de l’hébergeur seront ajoutées lors de la revue
            juridique.
          </p>
        </div>

        <div className="aide-bloc">
          <h2>Propriété intellectuelle</h2>
          <p>
            Le nom {PRODUIT_NOM}, la marque {MARQUE_NOM}, l’interface et le code du service
            appartiennent à {EDITEUR_NOM}. Les données que vous saisissez — biens, locataires, baux,
            paiements, documents — restent les vôtres.
          </p>
        </div>

        <div className="aide-bloc" id="documents-a-etablir">
          <h2>Documents encore à établir</h2>
          <ul>
            {LEGAL_OPEN_ITEMS.map((item) => <li key={item}>{item}</li>)}
          </ul>
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
