/**
 * Server-side session handling.
 *
 * The browser authenticates with Firebase Auth (incl. MFA), obtains an ID token,
 * and posts it to /api/auth/session. We exchange it for a Firebase **session
 * cookie** (httpOnly) so server components and route handlers can trust the user
 * without exposing the token to JS.
 */
import "server-only";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { Member, Org } from "@/lib/types";

export const SESSION_COOKIE = "medreach_session";
const FIVE_DAYS_MS = 60 * 60 * 24 * 5 * 1000;

export async function createSessionCookie(idToken: string): Promise<void> {
  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: FIVE_DAYS_MS,
  });
  cookies().set(SESSION_COOKIE, sessionCookie, {
    maxAge: FIVE_DAYS_MS / 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export function clearSessionCookie(): void {
  cookies().delete(SESSION_COOKIE);
}

export interface SessionUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  /** Firebase records the second factor in the token when MFA was used. */
  usedMfa: boolean;
}

/** Returns the signed-in user, or null. Never throws for anonymous callers. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookie = cookies().get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const decoded = await adminAuth.verifySessionCookie(cookie, true);
    // Firebase sets firebase.sign_in_second_factor (e.g. "totp"/"phone") only
    // when a second factor was actually used during sign-in.
    const secondFactor = (decoded.firebase as { sign_in_second_factor?: string })
      ?.sign_in_second_factor;
    return {
      uid: decoded.uid,
      email: decoded.email ?? "",
      emailVerified: Boolean(decoded.email_verified),
      usedMfa: Boolean(secondFactor),
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

/** Look up which org a user belongs to (via the userIndex collection). */
export async function getOrgIdForUser(uid: string): Promise<string | null> {
  const snap = await adminDb.collection("userIndex").doc(uid).get();
  return (snap.data()?.orgId as string) ?? null;
}

export interface OrgContext {
  user: SessionUser;
  orgId: string;
  org: Org;
  member: Member;
}

/** Require an authenticated user who belongs to an org; returns full context. */
export async function requireOrg(): Promise<OrgContext> {
  const user = await requireUser();
  const orgId = await getOrgIdForUser(user.uid);
  if (!orgId) throw new Error("NO_ORG");

  const [orgSnap, memberSnap] = await Promise.all([
    adminDb.collection("orgs").doc(orgId).get(),
    adminDb.collection("orgs").doc(orgId).collection("members").doc(user.uid).get(),
  ]);

  const org = orgSnap.data() as Org | undefined;
  const member = memberSnap.data() as Member | undefined;
  if (!org || !member) throw new Error("NO_ORG");

  return { user, orgId, org, member };
}
