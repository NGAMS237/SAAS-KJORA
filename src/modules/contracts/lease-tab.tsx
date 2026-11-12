import "server-only";
import Link from "next/link";
import { Eye, FileSignature, ShieldCheck } from "lucide-react";
import { Badge, Card } from "@/core/ui/ui";
import type { LeaseContract } from "@/modules/contracts/model";
import { getLeaseContract, getLeaseContracts } from "@/modules/contracts/server";
import { ContractEntryLink } from "@/modules/contracts/entry-link";
import type { PlanSlug } from "@/core/entitlements/model";

const ORDER: LeaseContract["status"][] = ["draft", "ready", "owner_signed", "sent", "tenant_signed", "completed"];
const STATUS: Record<LeaseContract["status"], string> = {
  draft: "Brouillon", ready: "Prêt à signer", owner_signed: "Signé par vous", sent: "Envoyé au locataire",
  tenant_signed: "Signé par le locataire", completed: "Finalisé", cancelled: "Annulé",
};

function day(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Douala" }).format(date);
}

// Étapes de signature du contrat, de la génération au PDF final.
export function contractTimeline(contract: LeaseContract) {
  const reached = ORDER.indexOf(contract.status);
  const owner = contract.signatures.find((signature) => signature.party === "owner")?.signedAt ?? null;
  const tenant = contract.signatures.find((signature) => signature.party === "tenant")?.signedAt ?? null;
  const steps = [
    { status: "draft", label: "Contrat généré", at: contract.createdAt },
    { status: "ready", label: "Relu et validé", at: null },
    { status: "owner_signed", label: "Signé par vous", at: owner },
    { status: "sent", label: "Envoyé au locataire", at: contract.sentAt },
    { status: "tenant_signed", label: "Signé par le locataire", at: tenant },
    { status: "completed", label: "PDF final scellé", at: contract.completedAt },
  ] as const;
  return steps.map((step, index) => ({ ...step, done: contract.status !== "cancelled" && index <= reached, current: index === reached + 1 && contract.status !== "cancelled" }));
}

function nextAction(contract: LeaseContract) {
  switch (contract.status) {
    case "draft": return "Relisez puis validez le contrat.";
    case "ready": return "Signez le contrat (dessin ou nom).";
    case "owner_signed": return "Envoyez-le au locataire via son espace.";
    case "sent": return "En attente de la signature du locataire.";
    case "tenant_signed": return "Finalisation du PDF en cours.";
    case "completed": return "Contrat signé par les deux parties.";
    default: return "Ce contrat a été annulé : vous pouvez en générer un nouveau.";
  }
}

export async function LeaseContractTab({ organizationId, leaseId, entitled, currentPlan }: { organizationId: string; leaseId: string; entitled: boolean; currentPlan: PlanSlug }) {
  if (!entitled) return <Card><ContractEntryLink currentPlan={currentPlan} entitled={false} leaseId={leaseId} /></Card>;
  const list: LeaseContract[] = await getLeaseContracts(organizationId, leaseId).catch(() => []);
  const latest = [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).find((item) => item.status !== "cancelled") ?? list[0] ?? null;
  if (!latest) {
    return (
      <Card>
        <div className="section-heading"><div><p className="eyebrow">Contrat</p><h2>Aucun contrat pour cette location</h2></div><FileSignature aria-hidden="true" /></div>
        <p className="field-help">Générez le contrat à partir des conditions de la location : il reprend votre fiche bailleur (logo, signature, cachet).</p>
        <ContractEntryLink currentPlan={currentPlan} entitled leaseId={leaseId} />
      </Card>
    );
  }
  const contract = (await getLeaseContract(organizationId, latest.id).catch(() => null)) ?? latest;
  const steps = contractTimeline(contract);
  const open = `/app/locations/${leaseId}/contrat?contract=${contract.id}`;
  return (
    <div className="page-stack">
      <Card>
        <div className="section-heading">
          <div><p className="eyebrow">{contract.reference}</p><h2>Contrat de location</h2></div>
          <Badge tone={contract.status === "completed" ? "success" : contract.status === "cancelled" ? "danger" : "info"}>{STATUS[contract.status]}</Badge>
        </div>
        <ol className="contract-timeline">
          {steps.map((step) => (
            <li className={step.done ? "is-done" : step.current ? "is-current" : ""} key={step.status}>
              {step.label}{step.done && day(step.at) ? <small>{day(step.at)}</small> : null}
            </li>
          ))}
        </ol>
        <p className="field-help">{nextAction(contract)}</p>
        <div className="demo-form-actions">
          <Link className="button button--primary" href={open}><FileSignature aria-hidden="true" size={16} /> {["draft", "ready", "owner_signed"].includes(contract.status) ? "Continuer" : "Ouvrir le contrat"}</Link>
          {contract.status !== "cancelled" ? <a className="button button--secondary" href={`/api/contracts/${contract.id}/preview`} rel="noopener" target="_blank"><Eye aria-hidden="true" size={16} /> Aperçu PDF</a> : null}
          {contract.status === "completed" ? <a className="button button--secondary" href={`/api/contracts/${contract.id}/download`}><ShieldCheck aria-hidden="true" size={16} /> PDF final signé</a> : null}
          {contract.status === "cancelled" ? <Link className="button button--secondary" href={`/app/locations/${leaseId}/contrat`}>Générer un nouveau contrat</Link> : null}
        </div>
      </Card>
      {list.length > 1 ? (
        <Card>
          <div className="section-heading"><div><p className="eyebrow">Historique</p><h2>Autres versions</h2></div></div>
          <div className="contract-list">{list.filter((item) => item.id !== contract.id).map((item) => (
            <Link className="list-row" href={`/app/locations/${leaseId}/contrat?contract=${item.id}`} key={item.id}><div className="list-row__body"><strong>{item.reference}</strong><span>Modèle v{item.templateVersion} · {day(item.createdAt) ?? ""}</span></div><Badge>{STATUS[item.status]}</Badge></Link>
          ))}</div>
        </Card>
      ) : null}
      <p className="field-help">Le logo, la signature et le cachet viennent de <Link href="/app/parametres/documents">Mes informations bailleur</Link>.</p>
    </div>
  );
}
