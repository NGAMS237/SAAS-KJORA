import { NextResponse, type NextRequest } from "next/server";
import { MEMBERSHIP_INVITATION_COOKIE } from "@/core/team/invitation-cookie";
import { getPublicRequestOrigin } from "@/core/routing/public-origin";
const TOKEN = /^[a-f0-9]{64}$/i;

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token || !TOKEN.test(token)) {
    return NextResponse.redirect(new URL("/invitation/accepter?reason=invalid", getPublicRequestOrigin(request)));
  }
  const response = NextResponse.redirect(new URL("/invitation/accepter", getPublicRequestOrigin(request)));
  response.cookies.set(MEMBERSHIP_INVITATION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}
