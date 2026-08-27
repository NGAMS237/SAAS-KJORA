import { BellRing } from "lucide-react";
import { FutureState, PageHeader } from "@/core/ui/ui";

export default function ActivityPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Organization active uniquement"
        title="Activité"
        description="Notifications, activité métier et audit resteront séparés et bornés à l’Organization active."
      />
      <FutureState
        className="future-state-card--signature"
        icon={BellRing}
        title="Chronologie opérationnelle"
        description="Aucune notification ou activité métier simulée n’est présentée comme un fait réel."
        availability="Disponible avec le Lot 6D — Dashboard + notifications + Activity/Audit"
      />
    </div>
  );
}
