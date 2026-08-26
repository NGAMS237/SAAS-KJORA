import { Download, Eye, ReceiptText } from "lucide-react";
import { Card, DemoNotice, ListRow, PageHeader } from "@/core/ui/ui";

export default function PortalReceiptsPage() {
  return (
    <div className="page-stack portal-page">
      <PageHeader
        eyebrow="Lecture seule"
        title="Reçus"
        description="Aucun lien public : les actions présentées ici sont uniquement visuelles dans le Lot 5A."
      />
      <DemoNotice />
      <Card>
        <div className="list-stack">
          <ListRow
            icon={ReceiptText}
            title="Reçu · Juillet 2026"
            description="240 000 XAF · Démonstration"
            trailing={<span className="receipt-actions"><button className="button button--secondary button--small" disabled type="button"><Eye aria-hidden="true" size={16} />Voir</button><button className="button button--secondary button--small" disabled type="button"><Download aria-hidden="true" size={16} />Télécharger</button></span>}
          />
          <ListRow
            icon={ReceiptText}
            title="Reçu · Juin 2026"
            description="240 000 XAF · Démonstration"
            trailing={<span className="receipt-actions"><button className="button button--secondary button--small" disabled type="button"><Eye aria-hidden="true" size={16} />Voir</button><button className="button button--secondary button--small" disabled type="button"><Download aria-hidden="true" size={16} />Télécharger</button></span>}
          />
        </div>
      </Card>
    </div>
  );
}
