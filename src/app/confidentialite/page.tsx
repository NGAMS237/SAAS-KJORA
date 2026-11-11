import Link from "next/link";
import { PublicFooter } from "@/core/ui/public-footer";
import {
  DATA_CATEGORIES,
  PROCESSORS,
  RETENTION_RULES,
  EDITEUR_NOM,
  MARQUE_NOM,
  FORMULATION_CANONIQUE,
  LEGAL_REVIEW_BEFORE_LAUNCH,
} from "@/core/legal/legal-facts";

export const metadata = {
  title: "Confidentialité",
  description: "Quelles données Kjora traite, pourquoi, où elles sont stockées et combien de temps.",
};

export default function ConfidentialitePage() {
  return (
    <main className="auth-page">
      <section className="auth-panel auth-panel--wide legal-page">
        <Link className="wordmark wordmark--auth" href="/">Kjora<span>.</span></Link>
        <p className="eyebrow">Confidentialité</p>
        <h1>Vos données dans Kjora</h1>

        <p className="legal-banner" role="note">
          <strong>{LEGAL_REVIEW_BEFORE_LAUNCH}</strong> — Ce texte décrit fidèlement le
          fonctionnement réel du produit. Il n’a pas été relu par un juriste et ne constitue pas une
          déclaration de conformité à une réglementation particulière.
        </p>

        <p className="auth-intro">
          Kjora est un outil de gestion locative. Vous y saisissez des informations sur vos biens et
          vos locataires : nous les traitons pour faire fonctionner le service, pas pour autre chose.
        </p>

        <div className="aide-bloc">
          <h2>Qui traite vos données</h2>
          <p>
            {FORMULATION_CANONIQUE} Le responsable du traitement est {EDITEUR_NOM} ; {MARQUE_NOM} en
            est l’activité numérique et n’a pas de personnalité juridique distincte. Les
            informations d’identification complètes figurent dans les{" "}
            <Link href="/mentions-legales">mentions légales</Link>.
          </p>
        </div>

        <div className="aide-bloc">
          <h2>Ce que nous traitons, et pourquoi</h2>
          <dl className="legal-list">
            {DATA_CATEGORIES.map((categorie) => (
              <div key={categorie.categorie}>
                <dt>{categorie.categorie}</dt>
                <dd>
                  {categorie.contenu}
                  <br />
                  <em>Finalité : {categorie.finalite}</em>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="aide-bloc">
          <h2>Données de vos locataires</h2>
          <p>
            Lorsque vous enregistrez un locataire, vous nous transmettez des données concernant une
            autre personne. Vous restez responsable de la légitimité de cette collecte auprès d’elle.
            Kjora applique une minimisation : un gardien ne voit que l’identité strictement nécessaire
            à son activité, et jamais les informations financières.
          </p>
          <p>
            Un locataire n’obtient un accès à son espace que si vous l’invitez explicitement. Cet accès
            est limité à ses propres baux et peut être révoqué immédiatement.
          </p>
        </div>

        <div className="aide-bloc">
          <h2>Ce que nous ne faisons pas</h2>
          <ul>
            <li>Nous ne vendons aucune donnée.</li>
            <li>Nous n’affichons aucune publicité et ne pratiquons aucun profilage publicitaire.</li>
            <li>Nous ne consolidons jamais les données de plusieurs organisations entre elles.</li>
            <li>Nous ne créons aucun accès locataire à partir d’un simple contact.</li>
            <li>Aucun mot de passe n’est collecté : il n’en existe pas.</li>
          </ul>
        </div>

        <div className="aide-bloc">
          <h2>Où vos données sont stockées</h2>
          <p>Le service repose sur les prestataires techniques suivants :</p>
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
            Ces prestataires agissent pour le compte de Kjora dans le cadre du fonctionnement du
            service. Aucun autre destinataire ne reçoit vos données.
          </p>
        </div>

        <div className="aide-bloc">
          <h2>Combien de temps</h2>
          <dl className="legal-list">
            {RETENTION_RULES.map((regle) => (
              <div key={regle.objet}>
                <dt>{regle.objet}</dt>
                <dd>{regle.duree}</dd>
              </div>
            ))}
          </dl>
          <p>
            Certains documents — pièces comptables, contrats — peuvent devoir être conservés plus
            longtemps que la durée opérationnelle, en raison d’obligations légales qui varient selon
            les pays. La matrice de conservation applicable doit être établie lors de la revue
            juridique, avant toute suppression automatisée.
          </p>
        </div>

        <div className="aide-bloc">
          <h2>Sécurité</h2>
          <p>
            Les mesures techniques réellement en place sont décrites en détail sur la page{" "}
            <Link href="/securite">Sécurité</Link>.
          </p>
        </div>

        <div className="aide-bloc">
          <h2>Vos droits</h2>
          <p>
            Selon le pays depuis lequel vous utilisez Kjora, vous pouvez disposer de droits d’accès, de
            rectification, d’effacement, d’opposition et de portabilité. L’étendue exacte de ces droits
            et les procédures applicables dépendent de la juridiction et doivent être précisées lors de
            la revue juridique.
          </p>
          <p>
            En pratique, dès aujourd’hui : vous pouvez consulter et corriger vos données directement
            dans l’application, et nous demander l’export ou la suppression de votre espace en écrivant
            depuis <Link href="/app/support">le support</Link>.
          </p>
        </div>

        <div className="aide-bloc">
          <h2>Évolutions</h2>
          <p>
            Kjora est en bêta : cette page évoluera avec le produit. Les changements significatifs vous
            seront signalés.
          </p>
        </div>

        <PublicFooter />
      </section>
    </main>
  );
}
