/**
 * Firebase connectivity check.
 * Loads .env.local, verifies the client + admin config is present, then does a
 * real Admin-SDK round-trip against Firestore (write + read + delete).
 *
 * Run:  npm run check:firebase
 *
 * It never prints secret values — only whether they are set and whether the
 * connection works.
 */
import { loadEnvConfig } from "@next/env";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

loadEnvConfig(process.cwd());

const CLIENT_VARS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];
const ADMIN_VARS = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
];
const OTHER_VARS = ["TOKEN_ENCRYPTION_KEY"];

function report(label: string, names: string[]): boolean {
  let ok = true;
  console.log(`\n${label}`);
  for (const name of names) {
    const set = Boolean(process.env[name]?.trim());
    console.log(`  ${set ? "✓" : "✗"} ${name}`);
    if (!set) ok = false;
  }
  return ok;
}

async function main() {
  console.log("MedReach — Firebase configuration check");
  const clientOk = report("Client SDK (browser auth):", CLIENT_VARS);
  const adminOk = report("Admin SDK (server):", ADMIN_VARS);
  const otherOk = report("Other:", OTHER_VARS);

  // Validate the encryption key length while we're here.
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (key && Buffer.from(key, "base64").length !== 32) {
    console.log(
      "\n⚠ TOKEN_ENCRYPTION_KEY is set but is not 32 bytes. Regenerate with:\n" +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }

  if (!adminOk) {
    console.log("\n✗ Admin credentials incomplete — cannot test Firestore. Fill them in .env.local.");
    process.exit(1);
  }

  console.log("\nTesting Firestore connection (Admin SDK)…");
  try {
    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n"),
        }),
      });
    }
    const db = getFirestore();
    const ref = db.collection("_healthcheck").doc("ping");
    await ref.set({ at: Date.now() });
    const snap = await ref.get();
    await ref.delete();
    console.log(`  ✓ Firestore write/read/delete succeeded (project: ${snap.data()?.at ? process.env.FIREBASE_ADMIN_PROJECT_ID : "?"})`);
  } catch (err) {
    console.log(`  ✗ Firestore connection failed:\n    ${String(err).split("\n")[0]}`);
    console.log(
      "\n    Common causes: Firestore database not created yet, wrong project id,\n" +
        "    or the private key wasn't pasted with \\n newlines inside quotes."
    );
    process.exit(1);
  }

  const allOk = clientOk && adminOk && otherOk;
  console.log(
    allOk
      ? "\n✅ All set. Run `npm run dev` and open http://localhost:3000"
      : "\n⚠ Firestore works, but some client/other vars are still missing (see ✗ above)."
  );
  process.exit(0);
}

main();
