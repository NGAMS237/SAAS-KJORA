import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export default async function PartnerDashboard(){
  const supabase=await createSupabaseServerClient();const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/partenaires/connexion");
  const {data,error}=await supabase.rpc("partner_dashboard_self");
  if(error)return <main className="auth-page"><section className="auth-panel"><h1>Espace partenaire / Partner area</h1><p>Votre accès partenaire n’est pas encore actif. / Your partner access is not active yet.</p></section></main>;
  return <main className="auth-page"><section className="auth-panel partner-panel"><p className="eyebrow">KJORA Partners</p><h1>{data.displayName}</h1>
    <p>Statut / Status: <strong>{data.status}</strong></p><h2>Codes et campagnes / Codes & campaigns</h2>
    <pre className="admin-ops-result">{JSON.stringify(data.codes,null,2)}</pre><h2>Activité / Activity</h2><p>Attributions: {data.attributions}</p>
    <pre className="admin-ops-result">{JSON.stringify(data.rewards,null,2)}</pre>
    <p>Aucune donnée de loyer, locataire, contrat ou paiement privé n’est exposée.</p>
  </section></main>;
}
