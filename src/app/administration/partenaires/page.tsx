import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reviewPartnerApplication } from "@/modules/partners/admin-actions";
export const dynamic="force-dynamic";
export default async function AdminPartners(){
  const supabase=await createSupabaseServerClient();const {data,error}=await supabase.rpc("admin_list_partner_applications",{p_limit:100,p_offset:0});
  return <section className="admin-page"><p className="eyebrow">Programme partenaires</p><h1>Candidatures et suivi pilote</h1>
    <p>Lecture de contrôle. Les décisions passent exclusivement par la RPC auditée et les paiements demeurent manuels avec séparation approbateur/payeur.</p>
    {error?<p className="form-feedback form-feedback--error">Données indisponibles.</p>:<div className="admin-table-wrap"><table><thead><tr><th>Nom</th><th>Type</th><th>Statut</th><th>Créée</th></tr></thead><tbody>
      {data.items.map((x:{id:string;applicant_name:string;partner_type:string;status:string;created_at:string})=><tr key={x.id}><td>{x.applicant_name}</td><td>{x.partner_type}</td><td>{x.status}</td><td>{new Date(x.created_at).toLocaleDateString("fr-CA")}</td><td><form action={reviewPartnerApplication}><input type="hidden" name="applicationId" value={x.id}/><button name="decision" value="approved">Approuver</button><button name="decision" value="refused">Refuser</button></form></td></tr>)}
    </tbody></table></div>}
  </section>;
}
