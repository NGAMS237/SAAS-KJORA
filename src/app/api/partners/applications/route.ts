import { createClient } from "@supabase/supabase-js";
import { createHash, createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSupabasePublicConfig } from "@/lib/supabase/config";
import { isPartnerType, PARTNER_TERMS_VERSION } from "@/modules/partners/program";

export const runtime = "nodejs";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const privateResponse = (body: unknown, init?: ResponseInit) => NextResponse.json(body, {
  ...init,
  headers: { ...init?.headers, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
});

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) {
      return privateResponse({error:"forbidden"},{status:403});
    }
    const salt=process.env.KJORA_PARTNERS_HASH_SALT?.trim();
    if(!salt || salt.length<32) return privateResponse({error:"temporarily_unavailable"},{status:503});
    const body=await request.json() as Record<string,unknown>;
    if (body.termsAccepted !== true || body.termsVersion !== PARTNER_TERMS_VERSION || !isPartnerType(body.partnerType)) {
      return privateResponse({error:"terms_or_partner_type_invalid"},{status:400});
    }
    const token=crypto.randomUUID()+crypto.randomUUID();
    const ip=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const {url,publishableKey}=requireSupabasePublicConfig();
    const supabase=createClient(url,publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await supabase.rpc("submit_partner_application",{
      p_name:String(body.name??""),p_email:String(body.email??""),p_partner_type:String(body.partnerType??""),
      p_locale:String(body.locale??"fr"),p_motivation:String(body.motivation??""),p_terms_version:PARTNER_TERMS_VERSION,
      p_status_token_hash:digest(token),
      p_submitter_fingerprint:createHmac("sha256",salt).update(`${ip}:${String(body.email??"").toLowerCase()}`).digest("hex"),
    });
    if(error) return privateResponse({error:error.code==="P0001"?"rate_limited":"invalid_application"},{status:error.code==="P0001"?429:400});
    return privateResponse({applicationId:data.applicationId,status:data.status,statusToken:token},{status:201});
  } catch {
    return privateResponse({error:"temporarily_unavailable"},{status:503});
  }
}

export async function GET(request: Request) {
  const url=new URL(request.url);const applicationId=url.searchParams.get("applicationId")??"";
  const token=url.searchParams.get("token")??"";
  if(!/^[0-9a-f-]{36}$/i.test(applicationId)||token.length<64)return privateResponse({error:"invalid_tracking"},{status:400});
  const {url:supabaseUrl,publishableKey}=requireSupabasePublicConfig();
  const supabase=createClient(supabaseUrl,publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await supabase.rpc("read_partner_application_status",{p_application_id:applicationId,p_status_token_hash:digest(token)});
  if(error||!data?.applicationId)return privateResponse({error:"not_found"},{status:404});
  return privateResponse(data);
}
