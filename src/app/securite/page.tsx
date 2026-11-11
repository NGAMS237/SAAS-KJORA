import Link from "next/link";
import { PublicFooter } from "@/core/ui/public-footer";
import {
  SECURITY_MEASURES,
  CERTIFICATIONS_NON_DETENUES,
  EDITEUR_NOM,
  MARQUE_NOM,
} from "@/core/legal/legal-facts";

export const metadata = {
  title: "Sécurité",
  description: "Les mesures de sécurité réellement en place dans Kjora.",
};

export default function SecuritePage() {
  return (
    <main className="auth-page">
      <section className="auth-panel auth-panel--wide legal-page">
        <Link className="wordmark wordmark--auth" href="/">Kjora<span>.</span></Link>
        <p className="eyebrow">Sécurité</p>
        <h1>Comment Kjora protège vos données</h1>

        <p className="auth-intro">
          Cette page décrit des mesures effectivement implémentées, pas des intentions. Chacune est
          vérifiable dans le fonctionnement du produit.
        </p>
        <p className="auth-intro">
          Le service est édité par {EDITEUR_NOM} et exploité sous la marque {MARQUE_NOM}.
        </p>

        <div className="aide-bloc">
          <h2>Mesures en place</h2>
          <dl className="legal-list">
            {SECURITY_MEASURES.map((mesure) => (
              <div key={mesure.titre}>
                <dt>{mesure.titre}</dt>
                <dd>{mesure.description}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="aide-bloc">
          <h2>Ce que nous ne revendiquons pas</h2>
          <p>
            Kjora ne détient aujourd’hui aucune certification de sécurité — notamment{" "}
            {CERTIFICATIONS_NON_DETENUES.join(", ")} — et n’en revendique aucune. Un audit externe
            n’a pas été réalisé. Nous préférons le dire clairement plutôt que d’entretenir un doute.
          </p>
          <p>
            Les mesures ci-dessus sont réelles, mais elles ne constituent pas une déclaration de
            conformité à une réglementation particulière. Cette qualification relève d’une revue
            juridique qui n’a pas encore eu lieu.
          </p>
        </div>

        <div className="aide-bloc">
          <h2>Votre part</h2>
          <ul>
            <li>Ouvrez le lien de connexion sur l’appareil depuis lequel vous l’avez demandé.</li>
            <li>Ne transmettez jamais à quiconque un code reçu par email : nous ne vous le demanderons jamais.</li>
            <li>Retirez sans tarder l’accès d’un collaborateur qui quitte votre organisation.</li>
            <li>Le verrou local à 6 chiffres protège un appareil partagé ; il ne remplace pas votre session.</li>
          </ul>
        </div>

        <div className="aide-bloc">
          <h2>Signaler une vulnérabilité</h2>
          <p>
            Si vous pensez avoir découvert une faille, écrivez-nous depuis la{" "}
            <Link href="/contact">page contact</Link> en décrivant ce que vous avez observé. Merci de
            ne pas la rendre publique avant que nous ayons pu la corriger, et de ne pas accéder aux
            données d’autres utilisateurs pour la démontrer.
          </p>
        </div>

        <PublicFooter />
      </section>
    </main>
  );
}
