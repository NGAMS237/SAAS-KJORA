"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function reviewPartnerApplication(formData:FormData){
  const id=String(formData.get("applicationId")??"");
  const decision=String(formData.get("decision")??"");
  if(!/^[0-9a-f-]{36}$/i.test(id)||!["under_review","approved","refused","suspended"].includes(decision))return;
  const supabase=await createSupabaseServerClient();
  const {error}=await supabase.rpc("admin_review_partner_application",{p_application_id:id,p_decision:decision,p_note:null});
  if(error)throw new Error("partner_review_failed");
  revalidatePath("/administration/partenaires");
}
