import Link from "next/link";
import { PartnerApplicationForm } from "@/modules/partners/application-form";

export default async function PartnersPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const p=await searchParams; const locale=(Array.isArray(p.locale)?p.locale[0]:p.locale)==="en"?"en":"fr";
  const t=(fr:string,en:string)=>locale==="en"?en:fr;
  return <main className="auth-page"><section className="auth-panel partner-panel"><Link className="wordmark wordmark--auth" href="/">Kjora<span>.</span></Link>
    <p className="eyebrow">{t("Programme partenaires pilote","Partner pilot program")}</p>
    <h1>{t("Faites connaître KJORA.","Help people discover KJORA.")}</h1>
    <p>{t("Une candidature ne crée aucun accès propriétaire et aucune commission automatique. L’équipe KJORA examine chaque dossier.","An application creates no owner access and no automatic commission. The KJORA team reviews every application.")}</p>
    <ul><li>{t("Suivi par code ou lien après approbation","Code or link tracking after approval")}</li><li>{t("Aucun accès aux données privées des clients","No access to customers’ private data")}</li><li>{t("Versements manuels et auditables pendant le pilote","Manual, auditable payouts during the pilot")}</li></ul>
    <PartnerApplicationForm locale={locale}/>
    <p><Link href={`/partenaires/connexion?locale=${locale}`}>{t("Déjà partenaire ? Se connecter","Already a partner? Sign in")}</Link></p>
  </section></main>;
}
