import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/core/auth/login-form";
import { safeNextPath } from "@/core/auth/safe-next-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export default async function PartnerLogin({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const p=await searchParams;const locale=(Array.isArray(p.locale)?p.locale[0]:p.locale)==="en"?"en":"fr";
  const rawNext=Array.isArray(p.next)?p.next[0]:p.next;
  const safe=safeNextPath(rawNext);
  const nextPath=safe.startsWith("/partenaire")?safe:"/partenaire";
  const reason=Array.isArray(p.reason)?p.reason[0]:p.reason;
  const supabase=await createSupabaseServerClient();const {data,error}=await supabase.auth.getClaims();
  if(!error&&data?.claims?.sub) redirect(nextPath);
  return <main className="auth-page"><section className="auth-panel"><Link className="wordmark wordmark--auth" href="/partenaires">Kjora<span>.</span></Link>
    <p className="eyebrow">{locale==="en"?"Partner area":"Espace partenaire"}</p>
    <h1>{locale==="en"?"Sign in to track your activity.":"Connectez-vous pour suivre votre activité."}</h1>
    <p>{locale==="en"?"This account is separate from owner and platform administration access.":"Ce compte est distinct des accès propriétaire et administration plateforme."}</p>
    {reason?<p className="form-feedback form-feedback--error" role="alert" tabIndex={-1}>{locale==="en"?"Your session is absent or has expired. Sign in again to continue.":"Votre session est absente ou expirée. Reconnectez-vous pour continuer."}</p>:null}
    <LoginForm nextPath={nextPath} locale={locale}/>
  </section></main>;
}
