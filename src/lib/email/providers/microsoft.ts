/**
 * Send through a connected Microsoft 365 / Outlook mailbox using Graph.
 * Refreshes an access token from the stored refresh token, then calls
 * POST /me/sendMail.
 */
import "server-only";
import type { Integration } from "@/lib/types";
import { decrypt } from "@/lib/crypto";
import type { OutgoingEmail } from "@/lib/email/mime";
import type { SendResult } from "./index";

export const MICROSOFT_SCOPES = [
  "offline_access",
  "openid",
  "email",
  "User.Read",
  "Mail.Send",
];

function tenant(): string {
  return process.env.MICROSOFT_OAUTH_TENANT || "common";
}

export function microsoftAuthorizeUrl(state: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_OAUTH_CLIENT_ID ?? "",
    response_type: "code",
    redirect_uri: `${base}/api/integrations/microsoft/callback`,
    response_mode: "query",
    scope: MICROSOFT_SCOPES.join(" "),
    state,
  });
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export async function microsoftExchangeCode(
  code: string
): Promise<TokenResponse> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_OAUTH_CLIENT_ID ?? "",
        client_secret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET ?? "",
        grant_type: "authorization_code",
        code,
        redirect_uri: `${base}/api/integrations/microsoft/callback`,
        scope: MICROSOFT_SCOPES.join(" "),
      }),
    }
  );
  if (!res.ok) throw new Error(`Microsoft token exchange failed: ${await res.text()}`);
  return res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_OAUTH_CLIENT_ID ?? "",
        client_secret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: MICROSOFT_SCOPES.join(" "),
      }),
    }
  );
  if (!res.ok) throw new Error(`Microsoft token refresh failed: ${await res.text()}`);
  const data = (await res.json()) as TokenResponse;
  return data.access_token;
}

export async function sendViaGraph(
  integration: Integration,
  email: OutgoingEmail
): Promise<SendResult> {
  if (!integration.refreshTokenEnc) {
    throw new Error("Microsoft integration has no stored refresh token");
  }
  const accessToken = await refreshAccessToken(decrypt(integration.refreshTokenEnc));

  const message = {
    message: {
      subject: email.subject,
      body: { contentType: "HTML", content: email.html },
      toRecipients: [{ emailAddress: { address: email.to } }],
      ...(email.replyTo
        ? { replyTo: [{ emailAddress: { address: email.replyTo } }] }
        : {}),
      ...(email.unsubscribeUrl
        ? {
            internetMessageHeaders: [
              { name: "List-Unsubscribe", value: `<${email.unsubscribeUrl}>` },
            ],
          }
        : {}),
    },
    saveToSentItems: true,
  };

  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    throw new Error(`Graph sendMail failed (${res.status}): ${await res.text()}`);
  }
  // sendMail returns 202 with no body / message id.
  return { messageId: res.headers.get("request-id") ?? "accepted" };
}
