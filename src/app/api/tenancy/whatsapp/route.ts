import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UUID_PATTERN } from "@/modules/properties/model";
import { phoneDefaultsForCountry } from "@/core/currency/metadata";
import { normalizePhoneE164 } from "@/modules/communications/manual-whatsapp";
const reply=(body:unknown,init?:ResponseInit)=>NextResponse.json(body,{...init,headers:{...init?.headers,"Cache-Control":"private, no-store"}});
export async function GET(request:Request){const tenantId=new URL(request.url).searchParams.get("tenantId");if(!tenantId||!UUID_PATTERN.test(tenantId))return reply({error:"invalid_tenant"},{status:400});
 const supabase=await createSupabaseServerClient();const {data,error}=await supabase.rpc("get_tenant_whatsapp_summary",{target_tenant_id:tenantId});
 if(error)return reply({error:error.code==="42501"?"forbidden":"summary_unavailable"},{status:error.code==="42501"?403:400});return reply(data);}
export async function POST(request:Request){if(request.headers.get("origin")!==new URL(request.url).origin)return reply({error:"forbidden"},{status:403});
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;const country=body&&typeof body.countryCode==="string"?phoneDefaultsForCountry(body.countryCode):null;
 if(!body||typeof body.tenantId!=="string"||!UUID_PATTERN.test(body.tenantId)||!country||body.callingCode!==country.callingCode||typeof body.nationalNumber!=="string"||body.phoneE164!==normalizePhoneE164(country.countryCode,body.nationalNumber)
  ||typeof body.whatsappDeclared!=="boolean"||typeof body.serviceConsent!=="boolean"||body.marketingConsent!==false||!["in_app","email","whatsapp"].includes(String(body.preferredChannel)))return reply({error:"invalid_preferences"},{status:400});
 const supabase=await createSupabaseServerClient();const {data,error}=await supabase.rpc("save_tenant_whatsapp_preferences_v2",{target_tenant_id:body.tenantId,p_country_code:country.countryCode,p_calling_code:country.callingCode,
  p_national_number:body.nationalNumber,p_phone_e164:body.phoneE164,p_whatsapp_declared:body.whatsappDeclared,p_preferred_channel:body.preferredChannel,p_service_consent:body.serviceConsent,p_marketing_consent:false,
  p_consent_source:"owner_tenant_form",p_consent_version:"tenant-whatsapp-v1"});if(error)return reply({error:error.code==="42501"?"forbidden":"invalid_preferences"},{status:error.code==="42501"?403:400});return reply(data);}
