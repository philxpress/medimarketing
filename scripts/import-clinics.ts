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
// Pause between batches so a bulk load respects Firestore's write-rate ramp-up
// (override with IMPORT_DELAY_MS). Blaze removes the daily cap, not the rate cap.
const DELAY_MS = Number(process.env.IMPORT_DELAY_MS ?? 200);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Commit a batch, retrying transient/rate-limit errors with backoff. */
async function commitWithRetry(
  b: FirebaseFirestore.WriteBatch,
  attempt = 0
): Promise<void> {
  try {
    await b.commit();
  } catch (err) {
    const code = (err as { code?: number }).code;
    // 4 DEADLINE_EXCEEDED, 8 RESOURCE_EXHAUSTED, 10 ABORTED, 13 INTERNAL, 14 UNAVAILABLE
    if (code !== undefined && [4, 8, 10, 13, 14].includes(code) && attempt < 6) {
      const wait = Math.min(30000, 1000 * 2 ** attempt);
      console.warn(`  batch retry ${attempt + 1} (code ${code}); waiting ${wait}ms…`);
      await sleep(wait);
      return commitWithRetry(b, attempt + 1);
    }
    throw err;
  }
}

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
      await commitWithRetry(batch);
      batch = store!.batch();
      inBatch = 0;
      if (DELAY_MS > 0) await sleep(DELAY_MS);
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
