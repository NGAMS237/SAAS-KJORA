"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card, PageHeader } from "@/core/ui/ui";
import type { ContractStampSettings, ContractTemplateVersion } from "@/modules/contracts/model";

async function mutate(body:Record<string,unknown>) { const response=await fetch("/api/contracts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const payload=await response.json() as {error?:string};if(!response.ok) throw new Error(payload.error??"contract_settings_failed"); }

function TemplateVersionEditor({template,busy,onSave}:{template:ContractTemplateVersion;busy:boolean;onSave:(body:Record<string,unknown>)=>Promise<void>}) {
  const [name,setName]=useState(template.name);const [sections,setSections]=useState(template.sections);const [makeDefault,setMakeDefault]=useState(template.isDefault);
  return <details className="contract-template-editor"><summary>Modifier par nouvelle version</summary><div className="page-stack"><label className="field"><span>Nom du modèle</span><input value={name} onChange={(event)=>setName(event.target.value)}/></label>
    {sections.map((section,index)=><fieldset key={section.key} className="contract-template-section"><legend>{section.key}</legend><label className="field"><span>Titre</span><input value={section.title} onChange={(event)=>setSections((current)=>current.map((item,position)=>position===index?{...item,title:event.target.value}:item))}/></label><label className="field"><span>Clause</span><textarea rows={4} value={section.body} onChange={(event)=>setSections((current)=>current.map((item,position)=>position===index?{...item,body:event.target.value}:item))}/></label><small>Condition contrôlée : {section.condition}</small></fieldset>)}
    <label className="contract-consent"><input type="checkbox" checked={makeDefault} onChange={(event)=>setMakeDefault(event.target.checked)}/><span>Utiliser cette nouvelle version par défaut</span></label><button className="button button--primary" disabled={busy} onClick={()=>onSave({action:"version_template",templateId:template.id,name,sections,makeDefault})}>Créer la version {template.version+1}</button></div></details>;
}

export function ContractSettingsView({templates,initialSettings}:{templates:ContractTemplateVersion[];initialSettings:ContractStampSettings}) {
  const router=useRouter();const [settings,setSettings]=useState(initialSettings);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function run(body:Record<string,unknown>){setBusy(true);setError("");try{await mutate(body);router.refresh();}catch(cause){setError(cause instanceof Error?cause.message:"contract_settings_failed");}finally{setBusy(false);}}
  return <div className="page-stack contract-settings"><PageHeader eyebrow="Documents contractuels" title="Modèles et cachet" description="Les modèles sont versionnés. Un contrat déjà généré conserve toujours sa version et ses données figées."/>
    <Card><div className="section-heading"><div><p className="eyebrow">Cachet visuel</p><h2>Identité Organization</h2></div><Badge tone="info">Graphique uniquement</Badge></div>
      <p className="field-help">Ce cachet ne constitue ni une signature qualifiée ni une certification juridique.</p>
      <label className="contract-consent"><input type="checkbox" checked={settings.enabled} onChange={(event)=>setSettings({...settings,enabled:event.target.checked})}/><span>Afficher le cachet sur le contrat final</span></label>
      <div className="form-grid"><label className="field"><span>Nom</span><input value={settings.name} onChange={(event)=>setSettings({...settings,name:event.target.value})}/></label><label className="field"><span>Société</span><input value={settings.company} onChange={(event)=>setSettings({...settings,company:event.target.value})}/></label><label className="field"><span>Téléphone</span><input value={settings.phone} onChange={(event)=>setSettings({...settings,phone:event.target.value})}/></label><label className="field"><span>Adresse courte</span><input value={settings.address} onChange={(event)=>setSettings({...settings,address:event.target.value})}/></label><label className="field"><span>Position</span><select value={settings.position} onChange={(event)=>setSettings({...settings,position:event.target.value==="footer"?"footer":"signature_block"})}><option value="signature_block">Bloc signatures</option><option value="footer">Pied de page</option></select></label></div>
      <button className="button button--primary" disabled={busy} onClick={()=>run({action:"save_settings",...settings})}>Enregistrer le cachet</button>
    </Card>
    <Card><div className="section-heading"><div><p className="eyebrow">Modèles contrôlés</p><h2>Versions disponibles</h2></div></div>
      <div className="contract-list">{templates.map((template)=><div className="contract-template-item" key={template.id}><div className="list-row"><div className="list-row__body"><strong>{template.name}</strong><span>{template.language.toUpperCase()} · v{template.version} · {template.isSystem?"KJORA":"Organization"} · {template.status}</span></div><div className="list-row__trailing"><Badge tone={template.status==="active"?"success":"neutral"}>{template.isDefault?"Par défaut":template.status}</Badge>{template.status==="active"?<button className="button button--secondary" disabled={busy} onClick={()=>run({action:"duplicate_template",templateId:template.id,name:`${template.name} — copie`})}>Dupliquer</button>:null}</div></div>{!template.isSystem&&template.status==="active"?<TemplateVersionEditor template={template} busy={busy} onSave={run}/>:null}</div>)}</div>
      <p className="field-help">Une modification crée une nouvelle version ; les contrats existants ne changent jamais. Les variables et conditions disponibles restent limitées par KJORA.</p>
    </Card>{error?<p className="form-error" role="alert">{error}</p>:null}
  </div>;
}
