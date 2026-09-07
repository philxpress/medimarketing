import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import {
  microsoftExchangeCode,
  MICROSOFT_SCOPES,
} from "@/lib/email/providers/microsoft";
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
    const expected = cookies().get("oauth_state_ms")?.value;

    if (!code || !state || state !== expected) {
      return NextResponse.redirect(`${base}/settings?integration=microsoft&error=state`);
    }
    cookies().delete("oauth_state_ms");

    const tokens = await microsoftExchangeCode(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(`${base}/settings?integration=microsoft&error=norefresh`);
    }

    // Look up the connected mailbox address from Graph.
    const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const me = await meRes.json();
    const email = me.mail || me.userPrincipalName || "";

    const integration: Integration = {
      provider: "microsoft",
      connectedEmail: email,
      connectedByUid: user.uid,
      scopes: MICROSOFT_SCOPES,
      refreshTokenEnc: encrypt(tokens.refresh_token),
      expiresAt: Date.now() + tokens.expires_in * 1000,
      status: "connected",
      updatedAt: Date.now(),
    };
    await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("integrations")
      .doc("microsoft")
      .set(integration);

    await logEvent(orgId, {
      type: "integration.connected",
      actorUid: user.uid,
      summary: `Connected Microsoft mailbox ${email}`,
    });

    return NextResponse.redirect(`${base}/settings?integration=microsoft&status=connected`);
  } catch (err) {
    return NextResponse.redirect(
      `${base}/settings?integration=microsoft&error=${encodeURIComponent(String(err).slice(0, 120))}`
    );
  }
}
