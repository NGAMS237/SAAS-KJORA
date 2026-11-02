import Link from "next/link";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";
import { PageHeader, Card } from "@/core/ui/ui";
import { SupportForm } from "@/core/support/support-form";

// Support bêta — accessible à tout membre authentifié d'une Organization active.
// Aucune capability particulière n'est exigée : demander de l'aide ne doit jamais
// dépendre d'un rôle. Aucune donnée d'une autre Organization n'est lisible ici.
export default async function SupportPage() {
  const context = await loadOrganizationContext();

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Aide"
        title="Support"
        description="Une question, un blocage ? Écrivez-nous depuis votre espace : nous saurons de quelle organisation vous parlez."
      />

      <Card>
        <SupportForm contactEmail={context.user.email} />
      </Card>

      <Card>
        <h2>Avant de nous écrire</h2>
        <ul className="support-tips">
          <li>
            <strong>Vous n’arrivez pas à vous connecter ?</strong> Le lien reçu par email s’ouvre dans le
            même navigateur et sur le même appareil que la demande. La page <Link href="/aide">Aide</Link>{" "}
            détaille les cas les plus courants.
          </li>
          <li>
            <strong>Un reçu ou un contrat est introuvable ?</strong> Tous les documents de votre
            organisation sont regroupés dans <Link href="/app/documents">Documents</Link>.
          </li>
          <li>
            <strong>Un montant vous semble faux ?</strong> Indiquez-nous la location et la période
            concernées : rien n’est corrigé silencieusement, toute correction est tracée.
          </li>
        </ul>
      </Card>
    </div>
  );
}
