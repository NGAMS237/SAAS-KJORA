import Link from "next/link";
import { LoginForm } from "@/core/auth/login-form";
export default async function PartnerLogin({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const p=await searchParams;const locale=(Array.isArray(p.locale)?p.locale[0]:p.locale)==="en"?"en":"fr";
  return <main className="auth-page"><section className="auth-panel"><Link className="wordmark wordmark--auth" href="/partenaires">Kjora<span>.</span></Link>
    <p className="eyebrow">{locale==="en"?"Partner area":"Espace partenaire"}</p>
    <h1>{locale==="en"?"Sign in to track your activity.":"Connectez-vous pour suivre votre activité."}</h1>
    <p>{locale==="en"?"This account is separate from owner and platform administration access.":"Ce compte est distinct des accès propriétaire et administration plateforme."}</p>
    <LoginForm nextPath="/partenaire" locale={locale}/>
  </section></main>;
}
