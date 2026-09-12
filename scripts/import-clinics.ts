/**
 * Load the built clinic database into Firestore.
 *
 * Prereq: run `python scripts/build-clinics.py` first — it produces
 * `Practitioner List/clinics.ndjson` from the local source crawls. This script
 * streams that file into the top-level, server-only `clinics` collection using
 * the Admin SDK (which bypasses security rules).
 *
 * Run:
 *   npx tsx scripts/import-clinics.ts            # dry run — parses + counts only
 *   npx tsx scripts/import-clinics.ts --commit   # actually writes to Firestore
 *
 * Credentials come from .env.local (same vars as `npm run check:firebase`).
 * Writing ~76k docs costs well under a dollar and is idempotent (doc id = the
 * clinic's stable id), so re-running overwrites rather than duplicates.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { loadEnvConfig } from "@next/env";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

loadEnvConfig(process.cwd());

const COMMIT = process.argv.includes("--commit");
const NDJSON = path.join(process.cwd(), "Practitioner List", "clinics.ndjson");
const COLLECTION = "clinics";
const BATCH = 500;

function db() {
  if (!getApps().length) {
    const { FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY } =
      process.env;
    if (!FIREBASE_ADMIN_PROJECT_ID || !FIREBASE_ADMIN_CLIENT_EMAIL || !FIREBASE_ADMIN_PRIVATE_KEY) {
      console.error("✗ Missing Firebase Admin credentials in .env.local.");
      process.exit(1);
    }
    initializeApp({
      credential: cert({
        projectId: FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
}

async function main() {
  if (!fs.existsSync(NDJSON)) {
    console.error(`✗ ${NDJSON} not found. Run: python scripts/build-clinics.py`);
    process.exit(1);
  }

  console.log(
    `Clinic import — ${COMMIT ? "COMMIT (writing to Firestore)" : "DRY RUN (no writes; pass --commit to write)"}`
  );

  const store = COMMIT ? db() : null;
  const col = store?.collection(COLLECTION);

  const rl = readline.createInterface({
    input: fs.createReadStream(NDJSON, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let total = 0;
  let batch = store?.batch();
  let inBatch = 0;

  async function flush() {
    if (batch && inBatch > 0) {
      await batch.commit();
      batch = store!.batch();
      inBatch = 0;
    }
  }

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const clinic = JSON.parse(trimmed) as { id: string };
    total++;
    if (col && batch) {
      batch.set(col.doc(clinic.id), clinic);
      inBatch++;
      if (inBatch === BATCH) {
        await flush();
        if (total % 10000 === 0) console.log(`  …${total} written`);
      }
    }
  }
  await flush();

  console.log(
    COMMIT
      ? `✓ Imported ${total} clinics into "${COLLECTION}".`
      : `✓ Parsed ${total} clinics. Re-run with --commit to write them to Firestore.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
