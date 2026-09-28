import Link from "next/link";
import { PartnerApplicationStatus } from "@/modules/partners/application-status";

export default async function PartnerTracking({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const p=await searchParams;
  const one=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]??"":value??"";
  const locale=one(p.locale)==="en"?"en":"fr";
  return <main className="auth-page"><section className="auth-panel">
    <Link className="wordmark wordmark--auth" href="/partenaires">Kjora<span>.</span></Link>
    <h1>{locale==="en"?"Application tracking":"Suivi de candidature"}</h1>
    <PartnerApplicationStatus applicationId={one(p.applicationId)} token={one(p.token)} locale={locale}/>
  </section></main>;
}
