import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { requireOrg } from "@/lib/auth/session";
import { googleOAuthClient, GMAIL_SCOPES } from "@/lib/email/providers/gmail";

/** Kick off the Google OAuth consent flow to connect a Gmail send-mailbox. */
export async function GET() {
  await requireOrg();
  const state = crypto.randomBytes(16).toString("hex");
  cookies().set("oauth_state_google", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const url = googleOAuthClient().generateAuthUrl({
    access_type: "offline", // request a refresh token
    prompt: "consent", // force refresh-token issuance on re-connect
    scope: GMAIL_SCOPES,
    state,
    include_granted_scopes: true,
  });
  return NextResponse.redirect(url);
}
