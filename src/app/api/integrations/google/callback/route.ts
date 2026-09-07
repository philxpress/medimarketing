import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { google } from "googleapis";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import { googleOAuthClient, GMAIL_SCOPES } from "@/lib/email/providers/gmail";
import { encrypt } from "@/lib/crypto";
import { logEvent } from "@/lib/data";
import type { Integration } from "@/lib/types";
// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    const { orgId, user } = await requireOrg();
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expected = cookies().get("oauth_state_google")?.value;

    if (!code || !state || state !== expected) {
      return NextResponse.redirect(`${base}/settings?integration=google&error=state`);
    }
    cookies().delete("oauth_state_google");

    const oauth2 = googleOAuthClient();
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      // Happens if the user previously consented; force re-consent.
      return NextResponse.redirect(`${base}/settings?integration=google&error=norefresh`);
    }
    oauth2.setCredentials(tokens);

    // Discover which mailbox was authorized.
    const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
    const me = await oauth2Api.userinfo.get();
    const email = me.data.email ?? "";

    const integration: Integration = {
      provider: "gmail",
      connectedEmail: email,
      connectedByUid: user.uid,
      scopes: GMAIL_SCOPES,
      refreshTokenEnc: encrypt(tokens.refresh_token),
      expiresAt: tokens.expiry_date ?? undefined,
      status: "connected",
      updatedAt: Date.now(),
    };
    await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("integrations")
      .doc("gmail")
      .set(integration);

    await logEvent(orgId, {
      type: "integration.connected",
      actorUid: user.uid,
      summary: `Connected Gmail mailbox ${email}`,
    });

    return NextResponse.redirect(`${base}/settings?integration=google&status=connected`);
  } catch (err) {
    return NextResponse.redirect(
      `${base}/settings?integration=google&error=${encodeURIComponent(String(err).slice(0, 120))}`
    );
  }
}
