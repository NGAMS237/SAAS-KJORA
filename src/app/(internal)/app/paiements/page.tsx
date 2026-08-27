import { WalletCards } from "lucide-react";
import { FutureState, PageHeader } from "@/core/ui/ui";

export default function PaymentsPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Cycle financier"
        title="Paiements"
        description="Les encaissements seront reliés aux échéances et au crédit locataire sans créer de chiffre provisoire."
      />
      <FutureState
        className="future-state-card--signature"
        icon={WalletCards}
        title="Suivi des paiements"
        description="Aucun paiement, montant encaissé ou reste à payer n’est affiché avant la mise en place de la vérité financière."
        availability="Disponible avec le Lot 6C2 — Payments + Allocation + Tenant credit"
      />
    </div>
  );
}
