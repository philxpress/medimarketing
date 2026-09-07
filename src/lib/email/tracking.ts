/**
 * Open & click tracking.
 *
 * On send we (a) append a 1x1 tracking pixel that pings /api/track/open, and
 * (b) rewrite every http(s) link to route through /api/track/click, which logs
 * the click and 302-redirects to the original URL. Tokens are HMAC-signed so
 * they can't be forged.
 */
import "server-only";
import crypto from "crypto";

function base() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
function secret() {
  return process.env.TOKEN_ENCRYPTION_KEY ?? "dev";
}

export function makeTrackToken(
  orgId: string,
  campaignId: string,
  contactId: string
): string {
  const payload = `${orgId}:${campaignId}:${contactId}`;
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return Buffer.from(payload).toString("base64url") + "." + sig;
}

export function verifyTrackToken(
  token: string
): { orgId: string; campaignId: string; contactId: string } | null {
  const [dataB64, sig] = token.split(".");
  if (!dataB64 || !sig) return null;
  const payload = Buffer.from(dataB64, "base64url").toString("utf8");
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  const [orgId, campaignId, contactId] = payload.split(":");
  if (!orgId || !campaignId || !contactId) return null;
  return { orgId, campaignId, contactId };
}

/** Rewrite links + append the open pixel for a single recipient's email. */
export function injectTracking(
  html: string,
  orgId: string,
  campaignId: string,
  contactId: string
): string {
  const token = makeTrackToken(orgId, campaignId, contactId);
  const b = base();

  // Rewrite href="http(s)://…" to go through the click tracker.
  const rewritten = html.replace(
    /href\s*=\s*(["'])(https?:\/\/[^"']+)\1/gi,
    (_m, quote: string, url: string) => {
      const tracked = `${b}/api/track/click?t=${token}&u=${encodeURIComponent(url)}`;
      return `href=${quote}${tracked}${quote}`;
    }
  );

  const pixel = `<img src="${b}/api/track/open?t=${token}" width="1" height="1" alt="" style="display:none" />`;
  return rewritten + pixel;
}
