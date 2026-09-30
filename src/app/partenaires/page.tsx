import Link from "next/link";
import { PartnerApplicationForm } from "@/modules/partners/application-form";

export default async function PartnersPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const p=await searchParams; const locale=(Array.isArray(p.locale)?p.locale[0]:p.locale)==="en"?"en":"fr";
  const t=(fr:string,en:string)=>locale==="en"?en:fr;
  return <main className="auth-page"><section className="auth-panel partner-panel"><Link className="wordmark wordmark--auth" href="/">Kjora<span>.</span></Link>
    <p><Link href={`/partenaires?locale=${locale === "fr" ? "en" : "fr"}`}>{locale === "fr" ? "English" : "Français"}</Link></p>
    <p className="eyebrow">{t("Programme partenaires pilote","Partner pilot program")}</p>
    <h1>{t("Faites connaître KJORA.","Help people discover KJORA.")}</h1>
    <p>{t("Une candidature ne crée aucun accès propriétaire et aucune commission automatique. L’équipe KJORA examine chaque dossier.","An application creates no owner access and no automatic commission. The KJORA team reviews every application.")}</p>
    <ul><li>{t("Commerciaux et influenceurs ont des profils distincts sous le même programme.","Sales partners and influencers have distinct profiles under the same program.")}</li><li>{t("Suivi par code ou lien après approbation","Code or link tracking after approval")}</li><li>{t("Aucun accès aux données privées des clients","No access to customers’ private data")}</li><li>{t("Toute récompense éventuelle reste à décider, puis à approuver et verser manuellement pendant le pilote.","Any potential reward remains to be decided, then manually approved and paid during the pilot.")}</li></ul>
    <aside className="form-feedback" aria-labelledby="partner-conditions"><strong id="partner-conditions">{t("Conditions visibles avant candidature","Conditions shown before applying")}</strong><ul><li>{t("La candidature est étudiée manuellement et peut être refusée ou suspendue.","The application is reviewed manually and may be declined or suspended.")}</li><li>{t("Le lien de suivi est privé : conservez-le comme un secret.","The tracking link is private: keep it secret.")}</li><li>{t("Aucune rémunération, montant ou pourcentage n’est promis à ce stade.","No compensation, amount, or percentage is promised at this stage.")}</li></ul><p><Link href="/confidentialite">{t("Confidentialité","Privacy")}</Link> · <Link href="/mentions-legales">{t("Mentions légales","Legal notice")}</Link></p></aside>
    <PartnerApplicationForm locale={locale}/>
    <p><Link href={`/partenaires/connexion?locale=${locale}`}>{t("Déjà partenaire ? Se connecter","Already a partner? Sign in")}</Link></p>
  </section></main>;
}
