import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reviewPartnerApplication } from "@/modules/partners/admin-actions";
export const dynamic="force-dynamic";
export default async function AdminPartners(){
  const supabase=await createSupabaseServerClient();const {data,error}=await supabase.rpc("admin_list_partner_applications",{p_limit:100,p_offset:0});
  return <section className="admin-page"><p className="eyebrow">Programme partenaires / Partner program</p><h1>Candidatures et suivi pilote / Pilot applications</h1>
    <p>Lecture de contrôle. Les décisions passent exclusivement par la RPC auditée et les paiements demeurent manuels avec séparation approbateur/payeur. / Decisions use the audited RPC only; payouts remain manual with approver/payer separation.</p>
    <p className="form-feedback">Les clients attribués, campagnes, récompenses et événements d’audit existent en base, mais aucune liste Admin bornée ne les expose encore. Ils restent volontairement non affichés jusqu’à une RPC de lecture dédiée et revue. / Attributed clients, campaigns, rewards and audit events exist in the database, but no bounded Admin read RPC exposes them yet. They intentionally remain hidden until a dedicated reviewed read RPC exists.</p>
    {error?<p className="form-feedback form-feedback--error">Données indisponibles. / Data unavailable.</p>:<div className="admin-table-wrap"><table><thead><tr><th>Nom / Name</th><th>Type</th><th>Statut / Status</th><th>Créée / Created</th><th>Décision / Decision</th></tr></thead><tbody>
      {data.items.map((x:{id:string;applicant_name:string;partner_type:string;status:string;created_at:string})=><tr key={x.id}><td>{x.applicant_name}</td><td>{x.partner_type}</td><td>{x.status}</td><td>{new Date(x.created_at).toLocaleDateString("fr-CA")}</td><td><form action={reviewPartnerApplication} className="admin-actions-row"><input type="hidden" name="applicationId" value={x.id}/><button className="admin-action-button" name="decision" value="under_review">Étudier / Review</button><button className="admin-action-button" name="decision" value="approved">Approuver / Approve</button><button className="admin-action-button" name="decision" value="refused">Refuser / Decline</button></form></td></tr>)}
    </tbody></table></div>}
  </section>;
}
