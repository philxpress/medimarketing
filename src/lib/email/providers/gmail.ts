/**
 * Send through a connected Gmail mailbox using the Gmail API.
 * Uses the stored (encrypted) OAuth refresh token to mint a short-lived access
 * token per send batch.
 */
import "server-only";
import { google } from "googleapis";
import type { Integration } from "@/lib/types";
import { decrypt } from "@/lib/crypto";
import { buildMime, type OutgoingEmail } from "@/lib/email/mime";
import type { SendResult } from "./index";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

export function googleOAuthClient() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    `${base}/api/integrations/google/callback`
  );
}

export async function sendViaGmail(
  integration: Integration,
  email: OutgoingEmail
): Promise<SendResult> {
  if (!integration.refreshTokenEnc) {
    throw new Error("Gmail integration has no stored refresh token");
  }
  const oauth2 = googleOAuthClient();
  oauth2.setCredentials({
    refresh_token: decrypt(integration.refreshTokenEnc),
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const raw = Buffer.from(buildMime(email))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return { messageId: res.data.id ?? "" };
}
