"use client";
/**
 * Browser-side auth flows built on Firebase Auth.
 * Handles email/password, Google & Microsoft OAuth login, the MFA (TOTP)
 * challenge during sign-in, and syncing a server session cookie afterwards.
 */
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  getMultiFactorResolver,
  multiFactor,
  TotpMultiFactorGenerator,
  TotpSecret,
  updateProfile,
  type MultiFactorResolver,
  type UserCredential,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";

/** Thrown when the user must complete a TOTP second factor to finish signing in. */
export class MfaRequired extends Error {
  constructor(public resolver: MultiFactorResolver) {
    super("MFA_REQUIRED");
  }
}

/** After any successful Firebase sign-in, exchange the ID token for a cookie. */
export async function syncServerSession(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("No signed-in user");
  const idToken = await user.getIdToken(true);
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error("Failed to create server session");
  // Ensure an org exists for this user (first login bootstraps onboarding).
  await fetch("/api/org/bootstrap", { method: "POST" });
}

function wrapMfa<T>(p: Promise<T>): Promise<T> {
  return p.catch((err: unknown) => {
    if (
      typeof err === "object" &&
      err &&
      (err as { code?: string }).code === "auth/multi-factor-auth-required"
    ) {
      throw new MfaRequired(getMultiFactorResolver(auth, err as any));
    }
    throw err;
  });
}

export async function loginWithEmail(email: string, password: string) {
  await wrapMfa(signInWithEmailAndPassword(auth, email, password));
  await syncServerSession();
}

export async function signupWithEmail(
  email: string,
  password: string,
  displayName: string
) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(cred.user, { displayName });
  await syncServerSession();
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  await wrapMfa(signInWithPopup(auth, provider));
  await syncServerSession();
}

export async function loginWithMicrosoft() {
  const provider = new OAuthProvider("microsoft.com");
  provider.setCustomParameters({ prompt: "select_account" });
  await wrapMfa(signInWithPopup(auth, provider));
  await syncServerSession();
}

/** Complete a pending MFA challenge with the 6-digit TOTP code. */
export async function completeMfa(
  resolver: MultiFactorResolver,
  code: string
): Promise<UserCredential> {
  const factor = resolver.hints[0];
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(factor.uid, code);
  const cred = await resolver.resolveSignIn(assertion);
  await syncServerSession();
  return cred;
}

export async function logout() {
  await fetch("/api/auth/session", { method: "DELETE" });
  await auth.signOut();
}

// ── MFA (TOTP) enrollment ──────────────────────────────────────────────

export interface TotpEnrollment {
  secret: TotpSecret;
  /** otpauth:// URI to render as a QR code in an authenticator app. */
  qrUri: string;
  /** The shared secret, for manual entry. */
  sharedKey: string;
}

/** Begin TOTP enrollment: returns a secret + QR URI to show the user. */
export async function startTotpEnrollment(
  accountName: string
): Promise<TotpEnrollment> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  const qrUri = secret.generateQrCodeUrl(accountName, "MediReach");
  return { secret, qrUri, sharedKey: secret.secretKey };
}

/** Finish enrollment by verifying a 6-digit code from the authenticator app. */
export async function finishTotpEnrollment(
  secret: TotpSecret,
  code: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code);
  await multiFactor(user).enroll(assertion, "Authenticator app");
  // Record enrollment on the member profile (best-effort).
  await fetch("/api/mfa/enrolled", { method: "POST" }).catch(() => {});
}

export function isMfaEnrolled(): boolean {
  const user = auth.currentUser;
  return Boolean(user && multiFactor(user).enrolledFactors.length > 0);
}
