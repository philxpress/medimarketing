/**
 * Mailbox connection health. When a send fails because the OAuth token is dead
 * (revoked, expired refresh token, consent withdrawn) we flip the integration to
 * "error" so the app can prompt the user to reconnect instead of silently
 * failing every future send.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { logEvent } from "@/lib/data";
import type { IntegrationProvider } from "@/lib/types";

/** Heuristic: does this error look like an auth/token failure? */
export function isAuthError(err: unknown): boolean {
  const s = String(err).toLowerCase();
  return (
    s.includes("invalid_grant") ||
    s.includes("invalid_client") ||
    s.includes("unauthorized") ||
    s.includes("401") ||
    s.includes("403") ||
    s.includes("token has been expired or revoked") ||
    s.includes("no stored refresh token") ||
    s.includes("aadsts") // Microsoft identity error family
  );
}

export async function markIntegrationError(
  orgId: string,
  provider: IntegrationProvider,
  detail: string
): Promise<void> {
  await adminDb
    .collection("orgs")
    .doc(orgId)
    .collection("integrations")
    .doc(provider)
    .set(
      { status: "error", lastError: detail.slice(0, 300), updatedAt: Date.now() },
      { merge: true }
    );
  await logEvent(orgId, {
    type: "integration.error",
    summary: `${provider} mailbox disconnected — reconnect needed`,
    meta: { detail: detail.slice(0, 300) },
  });
}
