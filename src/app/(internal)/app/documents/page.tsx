import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { getActiveAuthorization } from "@/core/authorization/server";
import { requirePlanFeature } from "@/core/entitlements/server";
import { getFinancialDocuments } from "@/modules/documents/server";
import { parseMonthEndSelection, type MonthEndPreview } from "@/modules/documents/month-end";
import { FinancialDocumentsPanel, MonthEndPreviewPanel } from "@/modules/documents/views";
import { listLeases } from "@/modules/tenancy/server";
import { getLeaseContracts } from "@/modules/contracts/server";
import { PageHeader, Card, EmptyState } from "@/core/ui/ui";
import { RecordTabs, type RecordTab } from "@/core/ui/record-tabs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// =============================================================================
// Documents — surface d'agrégation (D-142)
// =============================================================================
// Vue transversale des documents DÉJÀ produits par les modules existants.
// Aucun moteur documentaire parallèle : aucune table, aucune copie, aucun
// stockage propre. Cette page ne fait que lire les vérités existantes :
//   • documents financiers (reçus, quittances, avis, états de compte) ;
//   • contrats de bail, lorsque le plan et le rôle le permettent.
//
// Les capabilities et l'entitlement de plan sont revérifiés ici : la présence
// d'une entrée de navigation n'accorde jamais un accès.
// =============================================================================

const MAX_LEASES_SCANNED = 60;

export default async function DocumentsPage({ searchParams }: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const [authorization, query] = await Promise.all([getActiveAuthorization(), searchParams]);
  if (!authorization) return null;
  const monthSelection = parseMonthEndSelection(query.month);
  const monthEndArgs = monthSelection.targetMonth
    ? { target_organization_id: authorization.organizationId, target_month: monthSelection.targetMonth }
    : { target_organization_id: authorization.organizationId, target_month: null };

  const canViewFinancialDocuments = authorization.capabilities.includes("due.view")
    || authorization.capabilities.includes("receipt.view");

  // RBAC d'abord, puis entitlement de plan — règle ALIGN-01 inchangée.
  const hasContractRbac = authorization.capabilities.includes("contract.manage");
  const contractEntitlementError = hasContractRbac
    ? await requirePlanFeature(authorization.organizationId, "contracts")
    : null;
  const canViewContracts = hasContractRbac && !contractEntitlementError;

  const [documents, monthEndResult] = canViewFinancialDocuments
    ? await Promise.all([
      getFinancialDocuments(authorization.organizationId),
      createSupabaseServerClient().then((supabase) =>
        supabase.rpc("preview_africa_month_end", monthEndArgs),
      ),
    ])
    : [[], { data: null, error: null }];
  const monthEnd = monthEndResult.error ? null : monthEndResult.data as MonthEndPreview | null;

  // Les contrats vivent par bail : on agrège en relisant les baux existants.
  // Aucune RPC nouvelle, aucune duplication de donnée.
  let contracts: Array<{ id: string; leaseId: string; reference: string; status: string; createdAt: string }> = [];
  let contractsTruncated = false;
  if (canViewContracts) {
    const leases = await listLeases(authorization.organizationId);
    const scanned = leases.slice(0, MAX_LEASES_SCANNED);
    contractsTruncated = leases.length > scanned.length;
    const perLease = await Promise.all(
      scanned.map((lease) =>
        getLeaseContracts(authorization.organizationId, lease.id).catch(() => []),
      ),
    );
    contracts = perLease.flat().map((contract) => ({
      id: contract.id,
      leaseId: contract.leaseId,
      reference: contract.reference,
      status: contract.status,
      createdAt: contract.createdAt,
    })).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  const statusLabels: Record<string, string> = {
    draft: "Brouillon",
    ready: "Prêt à signer",
    owner_signed: "Signé par vous",
    sent: "Envoyé au locataire",
    tenant_signed: "Signé par le locataire",
    completed: "Signé par les deux parties",
    cancelled: "Annulé",
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Documents"
        title="Documents"
        description="Tous les documents déjà émis pour votre organisation, réunis au même endroit. Ils restent également accessibles depuis leur contexte d’origine."
      />

      <RecordTabs initial={query.month ? "fin-de-mois" : undefined} label="Sections des documents" tabs={[
        { id: "financiers", label: "Documents financiers", count: documents.length || undefined, content: canViewFinancialDocuments ? <FinancialDocumentsPanel
          canShare={authorization.capabilities.includes("receipt.share")}
          documents={documents}
          emailDeliveryEnabled={process.env.KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED === "true"}
          filterable
        /> : <Card>
          <EmptyState
            title="Documents financiers non accessibles"
            description="Votre rôle ne donne pas accès aux reçus, quittances et avis de cette organisation."
          />
        </Card> },
        ...(canViewFinancialDocuments ? [{ id: "fin-de-mois", label: "Fin de mois", content: <MonthEndPreviewPanel
          emailDeliveryEnabled={process.env.KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED === "true"}
          invalidMonth={monthSelection.invalid}
          preview={monthEnd}
          selectedMonth={monthSelection.selectedMonth}
        /> }] : []),
        ...(canViewContracts ? [{ id: "contrats", label: "Contrats", count: contracts.length || undefined, content: (<Card>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Contrats</p>
              <h2>Contrats de bail</h2>
            </div>
            <FileCheck2 size={22} />
          </div>
          {contracts.length ? (
            <>
              <div className="contract-list">
                {contracts.map((contract) => (
                  <Link
                    className="contract-row"
                    href={`/app/locations/${contract.leaseId}/contrat`}
                    key={contract.id}
                  >
                    <span className="contract-row__reference">{contract.reference}</span>
                    <span className="contract-row__status">
                      {statusLabels[contract.status] ?? contract.status}
                    </span>
                  </Link>
                ))}
              </div>
              {contractsTruncated ? (
                <p className="form-feedback" role="status">
                  Seuls les {MAX_LEASES_SCANNED} baux les plus récents sont parcourus ici. Les autres
                  contrats restent accessibles depuis leur location.
                </p>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon={FileCheck2}
              title="Aucun contrat"
              description="Les contrats générés depuis une location apparaîtront ici, avec leur état de signature."
            />
          )}
        </Card>) }] : []),
      ] satisfies RecordTab[]} />
    </div>
  );
}
