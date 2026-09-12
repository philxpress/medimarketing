/**
 * Platform-admin (operator) identity.
 *
 * Operators run the whole platform — they can create companies, browse the
 * shared prospect database and manage subscriptions. Membership is a simple
 * env allowlist (PLATFORM_ADMIN_EMAILS), independent of any org membership, so
 * an operator is trusted by their signed-in email, not by a role in a company.
 */
import "server-only";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";

/** Lowercased operator emails from PLATFORM_ADMIN_EMAILS (comma/space list). */
export function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return platformAdminEmails().includes(email.toLowerCase());
}

/** The signed-in user if they're a platform admin, else null. Never throws. */
export async function getPlatformAdmin(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return user && isPlatformAdminEmail(user.email) ? user : null;
}

/** For API routes: require a platform admin or throw FORBIDDEN. */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const admin = await getPlatformAdmin();
  if (!admin) throw new Error("FORBIDDEN");
  return admin;
}
