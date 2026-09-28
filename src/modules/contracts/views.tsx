"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/ui";
import { FileSignature, PenLine, Send, ShieldCheck } from "lucide-react";
import { filterContractSections, renderContractSections, type ContractTemplateSummary, type LeaseContract } from "@/modules/contracts/model";

const STATUS_LABELS: Record<LeaseContract["status"], string> = {
  draft: "Brouillon", ready: "Prêt", owner_signed: "Signé bailleur", sent: "Envoyé", tenant_signed: "Signé locataire", completed: "Finalisé", cancelled: "Annulé",
};

function ContractSignature({ contract, portal = false, language = "fr" }: { contract: LeaseContract; portal?: boolean; language?: "fr" | "en" }) {
  const router = useRouter(); const canvas = useRef<HTMLCanvasElement>(null);
  const [method, setMethod] = useState<"stylized_name" | "drawn">("stylized_name");
  const [displayName, setDisplayName] = useState(""); const [consent, setConsent] = useState(false);
  const [strokes, setStrokes] = useState<Array<{ x: number; y: number }>>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect(); return { x: Math.round(event.clientX - box.left), y: Math.round(event.clientY - box.top) };
  }
  function start(event: ReactPointerEvent<HTMLCanvasElement>) { event.currentTarget.setPointerCapture(event.pointerId); setStrokes([point(event)]); }
  function draw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = point(event); setStrokes((current) => {
      const previous = current.at(-1); const context = canvas.current?.getContext("2d");
      if (previous && context) { context.strokeStyle = "#1f2d27"; context.lineWidth = 2; context.lineCap = "round"; context.beginPath(); context.moveTo(previous.x,previous.y); context.lineTo(next.x,next.y); context.stroke(); }
      return [...current,next].slice(-1000);
    });
  }
  async function sign() {
    setBusy(true); setError("");
    const response = await fetch(portal ? "/api/tenant-portal/contracts" : "/api/contracts", { method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      action: portal ? "sign" : "owner_sign", contractId:contract.id, method, displayName, strokes, consent,
    }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) setError(payload.error ?? "signature_failed"); else router.refresh(); setBusy(false);
  }
  return <Card className="contract-signature-card">
    <div className="section-heading"><div><p className="eyebrow">{language === "en" ? "Explicit consent" : "Consentement explicite"}</p><h2>{language === "en" ? "Sign this exact version" : "Signer cette version exacte"}</h2></div><PenLine size={20} /></div>
    <div className="contract-methods">
      <button className={`button ${method === "stylized_name" ? "button--primary" : "button--secondary"}`} onClick={() => setMethod("stylized_name")}>{language === "en" ? "Name / initials" : "Nom / initiales"}</button>
      <button className={`button ${method === "drawn" ? "button--primary" : "button--secondary"}`} onClick={() => setMethod("drawn")}>{language === "en" ? "Draw" : "Dessiner"}</button>
    </div>
    {method === "stylized_name" ? <label className="field"><span>{language === "en" ? "Signature name" : "Nom de signature"}</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" /></label>
      : <div><canvas ref={canvas} width={520} height={150} className="contract-signature-pad" aria-label={language === "en" ? "Signature drawing area" : "Zone de dessin de la signature"} onPointerDown={start} onPointerMove={draw} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)} /><button className="button button--ghost" onClick={() => { setStrokes([]); const context=canvas.current?.getContext("2d"); context?.clearRect(0,0,520,150); }}>{language === "en" ? "Clear" : "Effacer"}</button></div>}
    <label className="contract-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>{language === "en" ? "I have read and accept this exact contract version." : "J’ai lu et j’accepte cette version exacte du contrat."}</span></label>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <button className="button button--primary" onClick={sign} disabled={busy || !consent}>{busy ? (language === "en" ? "Signing…" : "Signature…") : (language === "en" ? "Sign contract" : "Signer le contrat")}</button>
  </Card>;
}

async function action(actionName: string, data: Record<string, unknown>) {
  const response = await fetch("/api/contracts", { method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ action:actionName,...data }) });
  const payload = await response.json() as { contractId?: string; error?: string };
  if (!response.ok) throw new Error(payload.error ?? "contract_action_failed"); return payload;
}

// CONTRATS-UX-PILOTE-01 — libellés « en cours » par action + message de
// succès explicite, en plus de la désactivation déjà en place (anti
// double-clic). `pendingAction` (au lieu d'un simple booléen `busy`) permet
// à chaque bouton d'afficher SON propre état de progression pendant que
// tous les autres restent désactivés.
const ACTION_LABELS: Record<string, { idle: string; pending: string; success: string }> = {
  generate: { idle: "Générer un brouillon", pending: "Génération…", success: "Brouillon généré." },
  validate: { idle: "Valider cette version", pending: "Validation…", success: "Version validée." },
  send: { idle: "Envoyer au locataire", pending: "Envoi…", success: "Contrat envoyé au locataire." },
  cancel: { idle: "Annuler ce contrat", pending: "Annulation…", success: "Contrat annulé." },
};

function TemplateRealDataPreview({ template, previewSnapshot }: { template: ContractTemplateSummary; previewSnapshot: Record<string, unknown> }) {
  const lease = (previewSnapshot.lease ?? {}) as { deposit?: number; charges?: number; initial_payment?: number; end_date?: string | null; payment_terms?: string | null };
  const filtered = filterContractSections(template.sections, {
    deposit: Number(lease.deposit) || 0, charges: Number(lease.charges) || 0,
    initialPayment: Number(lease.initial_payment) || 0, endDate: lease.end_date ?? null, paymentTerms: lease.payment_terms ?? null,
  });
  const rendered = renderContractSections(filtered, previewSnapshot);
  return <div className="contract-template-preview" role="note">
    <p className="field-help">Aperçu avec les données déjà connues de CETTE Location (jamais fabriquées) : un champ non encore disponible ici s’affiche « — », exactement comme dans le contrat réellement généré.</p>
    {rendered.map((section) => <section key={section.key}><h4>{section.title}</h4><p>{section.body}</p></section>)}
  </div>;
}

export function InternalContractView({ leaseId, templates, contracts, selected, leasePaymentTermsRecorded, previewSnapshot }: { leaseId: string; templates: ContractTemplateSummary[]; contracts: LeaseContract[]; selected: LeaseContract | null; leasePaymentTermsRecorded?: boolean; previewSnapshot?: Record<string, unknown> }) {
  const router = useRouter();
  const [templateId,setTemplateId]=useState(templates.find((item)=>item.isDefault)?.id ?? templates[0]?.id ?? "");
  const [previewing,setPreviewing]=useState(false);
  const [pendingAction,setPendingAction]=useState<string|null>(null);
  const [error,setError]=useState(""); const [notice,setNotice]=useState("");
  const busy = pendingAction !== null;
  async function run(name:string,data:Record<string,unknown>={}) {
    setPendingAction(name);setError("");setNotice("");
    try {
      const result=await action(name,{contractId:selected?.id,...data});
      if(result.contractId) router.replace(`/app/locations/${leaseId}/contrat?contract=${result.contractId}`);
      setNotice(ACTION_LABELS[name]?.success ?? "Action effectuée.");
      router.refresh();
    } catch(cause) { setError(cause instanceof Error?cause.message:"contract_action_failed"); }
    finally { setPendingAction(null); }
  }
  const sections = selected ? renderContractSections(selected.contentSnapshot,selected.dataSnapshot) : [];
  const selectedTemplate = templates.find((template)=>template.id===templateId) ?? null;
  return <div className="page-stack contract-workspace">
    <PageHeader eyebrow="Location · Contrat" title="Contrat de location" description="Le bail reste valide indépendamment du contrat. Chaque signature porte sur une version figée et traçable." action={<Link className="button button--secondary" href={`/app/locations/${leaseId}`}>Retour au bail</Link>} />
    {leasePaymentTermsRecorded === false ? <Card muted className="contract-payment-terms-notice"><div className="section-heading"><div><p className="eyebrow">À compléter</p><h2>Modalités de paiement non renseignées</h2></div></div><p>Aucune modalité de paiement n’est enregistrée sur ce bail : la clause « Modalités de paiement » n’apparaîtra pas dans le contrat tant qu’elle n’est pas complétée. Rien n’est inventé à sa place.</p><Link className="button button--secondary" href={`/app/locations/${leaseId}?focus=payment_terms`}>Compléter les modalités de paiement</Link></Card> : null}
    {!selected ? <Card><div className="section-heading"><div><p className="eyebrow">Génération facultative</p><h2>Choisir un modèle</h2></div><FileSignature /></div>
      {contracts.length ? <div className="contract-list">{contracts.map((contract)=><Link key={contract.id} className="list-row" href={`/app/locations/${leaseId}/contrat?contract=${contract.id}`}><div className="list-row__body"><strong>{contract.reference}</strong><span>Modèle v{contract.templateVersion}</span></div><Badge>{STATUS_LABELS[contract.status]}</Badge></Link>)}</div> : null}
      <label className="field"><span>Modèle actif</span><select value={templateId} onChange={(event)=>{setTemplateId(event.target.value);setPreviewing(false);}}>{templates.map((template)=><option key={template.id} value={template.id}>{template.name} · {template.language.toUpperCase()} · v{template.version}</option>)}</select></label>
      <div className="contract-methods">
        {selectedTemplate ? <button className="button button--secondary" type="button" onClick={()=>setPreviewing((value)=>!value)}>{previewing ? "Masquer l’aperçu" : "Aperçu avec les données de cette Location"}</button> : null}
        <Link className="button button--secondary" href="/app/parametres/contrats">Voir tous les modèles disponibles</Link>
      </div>
      {previewing && selectedTemplate && previewSnapshot ? <TemplateRealDataPreview template={selectedTemplate} previewSnapshot={previewSnapshot} /> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button button--primary" disabled={busy||!templateId} onClick={()=>run("generate",{leaseId,templateId})}>{pendingAction==="generate" ? ACTION_LABELS.generate.pending : ACTION_LABELS.generate.idle}</button>
    </Card> : <>
      <Card className="contract-summary"><div className="section-heading"><div><p className="eyebrow">{selected.reference}</p><h2>Aperçu avant signature</h2></div><Badge tone={selected.status==="completed"?"success":selected.status==="cancelled"?"danger":"info"}>{STATUS_LABELS[selected.status]}</Badge></div>
        <p>Modèle figé v{selected.templateVersion} · {selected.language.toUpperCase()}</p>
        <div className="contract-preview">{sections.map((section)=><section key={section.key}><h3>{section.title}</h3><p>{section.body}</p></section>)}</div>
        {selected.contentSha256 ? <small className="contract-hash">Empreinte SHA-256 : {selected.contentSha256}</small> : null}
      </Card>
      {notice ? <p className="form-feedback" role="status">{notice}</p> : null}
      {selected.status === "draft" ? <button className="button button--primary" disabled={busy} onClick={()=>run("validate")}>{pendingAction==="validate" ? ACTION_LABELS.validate.pending : ACTION_LABELS.validate.idle}</button> : null}
      {selected.status === "ready" ? <ContractSignature contract={selected} /> : null}
      {selected.status === "owner_signed" ? <button className="button button--primary" disabled={busy} onClick={()=>run("send")}><Send size={17}/>{pendingAction==="send" ? ACTION_LABELS.send.pending : ACTION_LABELS.send.idle}</button> : null}
      {selected.status === "owner_signed" ? <p className="field-help">Un accès portail actif et explicitement relié à cette Location est requis. <Link href={`/app/locataires/${selected.tenantId}`}>Gérer l’accès locataire</Link>.</p> : null}
      {selected.status === "completed" ? <a className="button button--primary" href={`/api/contracts/${selected.id}/download`}><ShieldCheck size={17}/>Télécharger le PDF final</a> : null}
      {!['completed','cancelled'].includes(selected.status) ? <button className="button button--danger" disabled={busy} onClick={()=>{const reason=globalThis.prompt("Motif d’annulation");if(reason)void run("cancel",{reason});}}>{pendingAction==="cancel" ? ACTION_LABELS.cancel.pending : ACTION_LABELS.cancel.idle}</button> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </>}
  </div>;
}

type PortalContractItem = { id:string;leaseId:string;reference:string;status:LeaseContract["status"];language:"fr"|"en";createdAt:string;sentAt:string|null;completedAt:string|null };
export function PortalContractsView({ contracts, selected, language }: { contracts:PortalContractItem[];selected:LeaseContract|null;language:"fr"|"en" }) {
  const sections=selected?renderContractSections(selected.contentSnapshot,selected.dataSnapshot):[];
  if(!selected && !contracts.length) return <div className="page-stack"><PageHeader eyebrow={language==="en"?"My documents":"Mes documents"} title={language==="en"?"Contracts":"Contrats"} description={language==="en"?"Contracts shared securely by your lessor.":"Contrats partagés de manière sécurisée par votre bailleur."}/><Card><EmptyState title={language==="en"?"No contract available":"Aucun contrat disponible"} description={language==="en"?"A validated contract will appear here after it is sent.":"Un contrat validé apparaîtra ici après son envoi."}/></Card></div>;
  return <div className="page-stack contract-workspace"><PageHeader eyebrow={language==="en"?"Secure tenant space":"Espace locataire sécurisé"} title={language==="en"?"Contracts":"Contrats"} description={language==="en"?"Read and sign the exact version made available to you.":"Consultez et signez la version exacte mise à votre disposition."}/>
    {!selected?<Card><div className="contract-list">{contracts.map((contract)=><Link className="list-row" key={contract.id} href={`/portal/contrats?contract=${contract.id}`}><div className="list-row__body"><strong>{contract.reference}</strong><span>{new Date(contract.createdAt).toLocaleDateString(language==="en"?"en-GB":"fr-FR")}</span></div><Badge>{STATUS_LABELS[contract.status]}</Badge></Link>)}</div></Card>:<>
      <Card><div className="section-heading"><div><p className="eyebrow">{selected.reference}</p><h2>{language==="en"?"Contract preview":"Aperçu du contrat"}</h2></div><Badge tone={selected.status==="completed"?"success":"info"}>{STATUS_LABELS[selected.status]}</Badge></div><div className="contract-preview">{sections.map((section)=><section key={section.key}><h3>{section.title}</h3><p>{section.body}</p></section>)}</div><small className="contract-hash">SHA-256: {selected.contentSha256}</small></Card>
      {selected.status==="sent"?<ContractSignature contract={selected} portal language={language}/>:null}
      {selected.status==="completed"?<a className="button button--primary" href={`/api/tenant-portal/contracts/${selected.id}/download`}>{language==="en"?"Download final PDF":"Télécharger le PDF final"}</a>:null}
    </>}
  </div>;
}
