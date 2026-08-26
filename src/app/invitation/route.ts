import { NextResponse, type NextRequest } from "next/server";
import { MEMBERSHIP_INVITATION_COOKIE } from "@/core/team/invitation-cookie";
const TOKEN = /^[a-f0-9]{64}$/i;

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token || !TOKEN.test(token)) {
    return NextResponse.redirect(new URL("/invitation/accepter?reason=invalid", request.url));
  }
  const response = NextResponse.redirect(new URL("/invitation/accepter", request.url));
  response.cookies.set(MEMBERSHIP_INVITATION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}
