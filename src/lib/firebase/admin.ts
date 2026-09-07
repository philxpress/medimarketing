/**
 * Firebase Admin SDK — server only.
 * Verifies session cookies / ID tokens and performs privileged Firestore writes
 * (bypassing security rules) from route handlers and server actions.
 *
 * Initialization is lazy: credentials are only read on first actual use, so
 * importing this module during `next build` (page-data collection) does not
 * require env vars to be present.
 */
import "server-only";
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let _app: App | null = null;

function app(): App {
  if (_app) return _app;
  if (getApps().length) return (_app = getApps()[0]!);

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // Support both literal "\n" and real newlines in the stored key.
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_ADMIN_PROJECT_ID, " +
        "FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY."
    );
  }

  _app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return _app;
}

/** Lazily proxy an SDK singleton so nothing initializes at import time. */
function lazy<T extends object>(factory: () => T): T {
  let inst: T | null = null;
  return new Proxy({} as T, {
    get(_t, prop) {
      inst ??= factory();
      const value = (inst as Record<string | symbol, unknown>)[prop];
      return typeof value === "function" ? (value as Function).bind(inst) : value;
    },
  });
}

export const adminAuth: Auth = lazy<Auth>(() => getAuth(app()));
export const adminDb: Firestore = lazy<Firestore>(() => getFirestore(app()));
