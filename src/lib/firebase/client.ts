/**
 * Firebase client SDK — browser only.
 * Used for authentication (email/password, Google, Microsoft, MFA) and
 * direct Firestore reads guarded by security rules.
 *
 * IMPORTANT: the SDK is initialized only in the browser. During SSR / static
 * prerender (e.g. Vercel's build step) `getAuth()` would throw
 * `auth/invalid-api-key`, and these pages don't need Firebase on the server
 * anyway — the auth flows all run inside browser event handlers. So on the
 * server these exports are intentionally left uninitialized.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const isBrowser = typeof window !== "undefined";

export const firebaseApp: FirebaseApp = isBrowser
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : (undefined as unknown as FirebaseApp);

export const auth: Auth = isBrowser
  ? getAuth(firebaseApp)
  : (undefined as unknown as Auth);

export const db: Firestore = isBrowser
  ? getFirestore(firebaseApp)
  : (undefined as unknown as Firestore);
