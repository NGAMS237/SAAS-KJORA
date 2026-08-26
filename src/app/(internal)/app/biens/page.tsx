import { Building2, Plus } from "lucide-react";
import { Card, DemoNotice, EmptyState, PageHeader } from "@/core/ui/ui";

export default function PropertiesPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Patrimoine"
        title="Biens"
        description="La future liste des maisons, immeubles et unités de l’Organization active."
        action={
          <button className="button button--primary" disabled title="Disponible dans un prochain lot" type="button">
            <Plus aria-hidden="true" size={17} />
            Ajouter un bien
          </button>
        }
      />
      <DemoNotice />
      <Card>
        <EmptyState
          icon={Building2}
          title="Aucun bien dans cette démonstration"
          description="Le Lot 5A vérifie seulement la navigation. La création de biens et d’unités sera implémentée dans un lot métier ultérieur."
          action={<BadgeButton label="Création bientôt disponible" />}
        />
      </Card>
    </div>
  );
}

function BadgeButton({ label }: { label: string }) {
  return (
    <button className="button button--secondary" disabled type="button">
      {label}
    </button>
  );
}
