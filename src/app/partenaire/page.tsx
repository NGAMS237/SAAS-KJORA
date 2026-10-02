import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PartnerDashboardView } from "@/modules/partners/partner-dashboard";
export const dynamic="force-dynamic";
export default async function PartnerDashboard(){
  const supabase=await createSupabaseServerClient();const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/partenaires/connexion?reason=session-required&next=/partenaire");
  const {data,error}=await supabase.rpc("partner_dashboard_self");
  if(error)return <main className="auth-page"><section className="auth-panel"><h1>Espace partenaire / Partner area</h1><p role="alert">Votre accès partenaire n’est pas actif ou le service est temporairement indisponible. / Your partner access is not active or the service is temporarily unavailable.</p><Link className="button button--primary" href="/partenaires/connexion?reason=session-required&next=/partenaire">Se reconnecter / Sign in again</Link><Link className="button button--secondary" href="/partenaire">Réessayer / Try again</Link></section></main>;
  const site=process.env.KJORA_COMMERCIAL_SITE_URL;
  let commercialSiteUrl:string|null=null;
  try { if(site){const parsed=new URL(site);if(["http:","https:"].includes(parsed.protocol))commercialSiteUrl=parsed.toString().replace(/\/$/,"");} } catch {}
  return <PartnerDashboardView data={data} commercialSiteUrl={commercialSiteUrl}/>;
}
