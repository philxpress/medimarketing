/**
 * CAN-SPAM / consent helpers.
 *
 * Every commercial email we send MUST carry:
 *   1. a valid physical postal address of the sender, and
 *   2. a working unsubscribe mechanism.
 * We append a compliant footer and generate a signed unsubscribe link.
 */
import "server-only";
import crypto from "crypto";
import type { Org } from "@/lib/types";

/** Signed, tamper-proof unsubscribe token (no DB lookup needed to validate). */
export function makeUnsubscribeToken(orgId: string, contactId: string): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY ?? "dev";
  const payload = `${orgId}:${contactId}`;
  const sig = crypto
    .createHmac("sha256", key)
    .update(payload)
    .digest("base64url");
  return Buffer.from(payload).toString("base64url") + "." + sig;
}

export function verifyUnsubscribeToken(
  token: string
): { orgId: string; contactId: string } | null {
  const [dataB64, sig] = token.split(".");
  if (!dataB64 || !sig) return null;
  const payload = Buffer.from(dataB64, "base64url").toString("utf8");
  const key = process.env.TOKEN_ENCRYPTION_KEY ?? "dev";
  const expected = crypto
    .createHmac("sha256", key)
    .update(payload)
    .digest("base64url");
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  const [orgId, contactId] = payload.split(":");
  if (!orgId || !contactId) return null;
  return { orgId, contactId };
}

/** Human-facing unsubscribe page (used in the footer link). */
export function unsubscribeUrl(orgId: string, contactId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/unsubscribe?token=${makeUnsubscribeToken(orgId, contactId)}`;
}

/** RFC 8058 one-click endpoint (used in the List-Unsubscribe header; supports POST). */
export function oneClickUnsubscribeUrl(orgId: string, contactId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/api/unsubscribe?token=${makeUnsubscribeToken(orgId, contactId)}`;
}

/** Appends the legally-required footer to an already-rendered HTML body. */
export function withComplianceFooter(
  html: string,
  org: Org,
  unsubUrl: string
): string {
  const footer = `
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;
              font-family:system-ui,sans-serif;font-size:12px;color:#6b7280;line-height:1.5">
    <p style="margin:0 0 4px">You are receiving this email from <strong>${escapeHtml(
      org.name
    )}</strong>.</p>
    <p style="margin:0 0 4px">${escapeHtml(org.postalAddress)}</p>
    <p style="margin:0">
      <a href="${unsubUrl}" style="color:#6b7280;text-decoration:underline">Unsubscribe</a>
      from future emails.
    </p>
  </div>`;
  return `${html}${footer}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
