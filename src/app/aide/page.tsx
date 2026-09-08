import Link from "next/link";
import { PublicFooter } from "@/core/ui/public-footer";

export const metadata = {
  title: "Aide — Kjora",
  description: "Résoudre un problème de connexion à Kjora.",
};

// Page publique : accessible sans session, notamment quand la connexion échoue.
// Volontairement sans jargon technique — ni PKCE, ni token, ni code d'erreur.
export default function AidePage() {
  return (
    <main className="auth-page">
      <section className="auth-panel auth-panel--wide">
        <Link className="wordmark wordmark--auth" href="/">Kjora<span>.</span></Link>
        <p className="eyebrow">Aide</p>
        <h1>Un problème pour vous connecter ?</h1>
        <p className="auth-intro">
          Kjora fonctionne sans mot de passe. Vous recevez par email un lien sécurisé, valable un court
          moment et utilisable une seule fois.
        </p>

        <div className="aide-bloc">
          <h2>Je n’ai pas reçu l’email</h2>
          <ul>
            <li>Vérifiez le dossier indésirables ou promotions de votre messagerie.</li>
            <li>Vérifiez l’adresse saisie : un email d’accès n’est envoyé qu’à l’adresse exacte.</li>
            <li>
              Patientez une minute, puis demandez un nouvel envoi depuis la{" "}
              <Link href="/connexion">page de connexion</Link>.
            </li>
          </ul>
        </div>

        <div className="aide-bloc">
          <h2>Le lien indique qu’il n’est plus valable</h2>
          <p>
            C’est normal dans trois situations : le lien a déjà servi, il a expiré, ou il a été ouvert
            sur un autre appareil ou dans un autre navigateur que celui d’où vous l’avez demandé.
          </p>
          <p>
            La solution est toujours la même : revenez sur la{" "}
            <Link href="/connexion">page de connexion</Link>, demandez un nouvel email et ouvrez le lien
            dans <strong>ce même navigateur</strong>.
          </p>
        </div>

        <div className="aide-bloc">
          <h2>Le lien s’ouvre mais rien ne se passe</h2>
          <p>
            Certains antivirus et certaines messageries d’entreprise ouvrent les liens avant vous, ce qui
            consomme le lien. Dans ce cas, utilisez plutôt le <strong>code à usage unique</strong> proposé
            en alternative sur la page de connexion : copiez-le depuis l’email et saisissez-le.
          </p>
        </div>

        <div className="aide-bloc">
          <h2>Je suis locataire, pas propriétaire</h2>
          <p>
            L’espace locataire a sa propre entrée :{" "}
            <Link href="/portal/connexion">connexion locataire</Link>. Votre accès est créé par le
            propriétaire ou le gestionnaire de votre logement.
          </p>
        </div>

        <div className="aide-bloc">
          <h2>Rien de tout cela ne fonctionne</h2>
          <p>
            Si vous parvenez à vous connecter, écrivez-nous depuis{" "}
            <Link href="/app/support">le support intégré</Link> : nous saurons immédiatement de quelle
            organisation vous parlez. Sinon, passez par la <Link href="/contact">page contact</Link>.
          </p>
        </div>

        <p className="auth-footnote">
          Ne communiquez jamais un code reçu par email, à personne. Kjora ne vous le demandera jamais.
        </p>
        <PublicFooter />
      </section>
    </main>
  );
}
