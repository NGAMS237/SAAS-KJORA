import { NextResponse, type NextRequest } from "next/server";
import { TENANT_PORTAL_INVITATION_COOKIE } from "@/tenant-portal/invitation-cookie";

const TOKEN = /^[a-f0-9]{64}$/i;

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token || !TOKEN.test(token)) return NextResponse.redirect(new URL("/portal/connexion?reason=invalid-invitation", request.url));
  const destination = new URL("/portal/invitation/accepter", request.url);
  destination.searchParams.set("lang", request.nextUrl.searchParams.get("lang") === "en" ? "en" : "fr");
  const response = NextResponse.redirect(destination);
  response.cookies.set(TENANT_PORTAL_INVITATION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 24 * 60 * 60 });
  return response;
}
