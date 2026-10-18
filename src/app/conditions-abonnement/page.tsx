import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooter } from "@/core/ui/public-footer";

export const metadata: Metadata = {
  title: "Conditions d'abonnement KJORA",
  description: "Cadre du pilote privé des abonnements KJORA.",
};

export default async function SubscriptionTermsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).locale;
  const locale = (Array.isArray(raw) ? raw[0] : raw) === "en" ? "en" : "fr";
  const en = locale === "en";
  return (
    <main className="auth-page">
      <section className="auth-panel auth-panel--wide legal-page">
        <Link className="wordmark wordmark--auth" href={`/?locale=${locale}`}>Kjora<span>.</span></Link>
        <p className="eyebrow">{en ? "Private paid pilot" : "Pilote payant privé"}</p>
        <h1>{en ? "Subscription conditions" : "Conditions d'abonnement"}</h1>
        <p className="auth-intro">
          {en
            ? "This page describes the operational framework prepared for the invitation-only pilot. It is not a claim that Live payments are enabled."
            : "Cette page décrit le cadre opérationnel préparé pour le pilote sur invitation. Elle ne signifie pas que les paiements Live sont activés."}
        </p>
        <div className="aide-bloc">
          <h2>{en ? "Plans and billing" : "Forfaits et facturation"}</h2>
          <ul>
            <li>{en ? "Discovery remains available without a card." : "Découverte reste accessible sans carte."}</li>
            <li>{en ? "Paid plans use the monthly or annual cycle selected before Checkout." : "Les forfaits payants utilisent le cycle mensuel ou annuel choisi avant Checkout."}</li>
            <li>{en ? "The confirmed amount and currency are displayed by Stripe before payment." : "Le montant et la devise confirmés sont affichés par Stripe avant paiement."}</li>
            <li>{en ? "A paid plan is activated only after a verified provider event." : "Un forfait payant est activé uniquement après un événement fournisseur vérifié."}</li>
          </ul>
        </div>
        <div className="aide-bloc">
          <h2>{en ? "Cancellation and incidents" : "Résiliation et incidents"}</h2>
          <p>{en
            ? "Cancellation is managed through the secure customer portal. Its effective date is shown before confirmation. A failed payment never counts as a confirmed payment."
            : "La résiliation se gère depuis le portail client sécurisé. Sa date d'effet est affichée avant confirmation. Un paiement échoué n'est jamais présenté comme confirmé."}</p>
        </div>
        <div className="aide-bloc">
          <h2>{en ? "Legal review still required" : "Revue juridique encore requise"}</h2>
          <p><strong>{en ? "TO BE VALIDATED BY BLAISE and legal counsel:" : "À VALIDER PAR BLAISE et le conseil juridique :"}</strong>{" "}
            {en
              ? "final refund policy, consumer withdrawal rules, taxes, invoice wording, governing law and dispute process before any public Live launch."
              : "politique finale de remboursement, droit de rétractation, taxes, libellé des factures, droit applicable et procédure de litige avant tout lancement Live public."}</p>
        </div>
        <PublicFooter locale={locale} />
      </section>
    </main>
  );
}
