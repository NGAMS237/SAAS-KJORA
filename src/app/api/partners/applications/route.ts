import { createClient } from "@supabase/supabase-js";
import { createHash, createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSupabasePublicConfig } from "@/lib/supabase/config";

export const runtime = "nodejs";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export async function POST(request: Request) {
  try {
    const salt=process.env.KJORA_PARTNERS_HASH_SALT?.trim();
    if(!salt || salt.length<32) return NextResponse.json({error:"temporarily_unavailable"},{status:503});
    const body=await request.json() as Record<string,unknown>;
    const token=crypto.randomUUID()+crypto.randomUUID();
    const ip=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const {url,publishableKey}=requireSupabasePublicConfig();
    const supabase=createClient(url,publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await supabase.rpc("submit_partner_application",{
      p_name:String(body.name??""),p_email:String(body.email??""),p_partner_type:String(body.partnerType??""),
      p_locale:String(body.locale??"fr"),p_motivation:String(body.motivation??""),
      p_status_token_hash:digest(token),
      p_submitter_fingerprint:createHmac("sha256",salt).update(`${ip}:${String(body.email??"").toLowerCase()}`).digest("hex"),
    });
    if(error) return NextResponse.json({error:error.code==="P0001"?"rate_limited":"invalid_application"},{status:error.code==="P0001"?429:400});
    return NextResponse.json({applicationId:data.applicationId,status:data.status,statusToken:token},{status:201});
  } catch {
    return NextResponse.json({error:"temporarily_unavailable"},{status:503});
  }
}

export async function GET(request: Request) {
  const url=new URL(request.url);const applicationId=url.searchParams.get("applicationId")??"";
  const token=url.searchParams.get("token")??"";
  if(!/^[0-9a-f-]{36}$/i.test(applicationId)||token.length<64)return NextResponse.json({error:"invalid_tracking"},{status:400});
  const {url:supabaseUrl,publishableKey}=requireSupabasePublicConfig();
  const supabase=createClient(supabaseUrl,publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await supabase.rpc("read_partner_application_status",{p_application_id:applicationId,p_status_token_hash:digest(token)});
  if(error||!data?.applicationId)return NextResponse.json({error:"not_found"},{status:404});
  return NextResponse.json(data);
}
