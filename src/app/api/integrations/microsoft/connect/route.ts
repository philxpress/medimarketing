import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { requireOrg } from "@/lib/auth/session";
import { microsoftAuthorizeUrl } from "@/lib/email/providers/microsoft";

/** Start the Microsoft OAuth flow to connect an M365/Outlook send-mailbox. */
export async function GET() {
  await requireOrg();
  const state = crypto.randomBytes(16).toString("hex");
  cookies().set("oauth_state_ms", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return NextResponse.redirect(microsoftAuthorizeUrl(state));
}
