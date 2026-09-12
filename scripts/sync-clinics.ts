/**
 * Incrementally sync the Firestore `clinics` collection to the freshly-built
 * clinics.ndjson — writing ONLY the documents that actually changed (updated
 * HotDoc details, new types, cleaned names, …) plus any brand-new clinics.
 *
 * Why not just re-import? A full import rewrites all ~76k docs every time. This
 * reads the collection once, diffs by a content signature, and writes only the
 * delta — far fewer writes, no needless churn, and safe to run after every crawl.
 *
 * Prereq: run `python scripts/build-clinics.py` first so clinics.ndjson is current.
 *
 * Run:
 *   npx tsx scripts/sync-clinics.ts            # DRY RUN — reports the delta only
 *   npx tsx scripts/sync-clinics.ts --commit   # writes the changed/new docs
 *
 * Credentials come from .env.local (same vars as the other scripts).
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
const DELAY_MS = Number(process.env.IMPORT_DELAY_MS ?? 200);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Clinic {
  id: string;
  name: string; address: string; suburb: string; state: string; postcode: string;
  phone: string; fax: string; email: string; website: string;
  lat: number | null; lng: number | null; geohash: string | null;
  sources: string[]; bookable: boolean; billingType: string;
  doctorCount: number | null; types?: string[];
}

/** Content fingerprint — everything that can change between builds. */
function sig(c: Clinic): string {
  const r = (n: number | null) => (n == null ? null : Math.round(n * 1e6) / 1e6);
  return JSON.stringify([
    c.name, c.address, c.suburb, c.state, c.postcode, c.phone, c.fax, c.email,
    c.website, r(c.lat), r(c.lng), c.geohash, c.sources ?? [], c.bookable,
    c.billingType, c.doctorCount ?? null, c.types ?? [],
  ]);
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
  console.log(`Clinic sync — ${COMMIT ? "COMMIT" : "DRY RUN (no writes)"}`);

  // 1. Load the freshly-built records: id -> { record, signature }.
  const next = new Map<string, { rec: Clinic; sig: string }>();
  const rl = readline.createInterface({
    input: fs.createReadStream(NDJSON, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    const rec = JSON.parse(t) as Clinic;
    next.set(rec.id, { rec, sig: sig(rec) });
  }
  console.log(`  built records: ${next.size}`);

  const store = db();
  const col = store.collection(COLLECTION);

  // 2. Stream the existing collection once; classify each doc.
  let existing = 0;
  const toUpdate: Clinic[] = [];
  const seen = new Set<string>();
  const sampleDiffs: string[] = [];
  for await (const doc of col.stream() as AsyncIterable<FirebaseFirestore.QueryDocumentSnapshot>) {
    existing++;
    seen.add(doc.id);
    const n = next.get(doc.id);
    if (!n) continue; // in DB but not in the new build → left alone (reported below)
    if (sig(doc.data() as Clinic) !== n.sig) {
      toUpdate.push(n.rec);
      if (sampleDiffs.length < 8) sampleDiffs.push(n.rec.name || n.rec.address || n.rec.id);
    }
  }

  // 3. Records present in the build but not in the DB → new additions.
  const toAdd: Clinic[] = [];
  for (const [id, n] of next) if (!seen.has(id)) toAdd.push(n.rec);
  const missingFromBuild = existing - seen.size < 0 ? 0 : [...seen].filter((id) => !next.has(id)).length;

  console.log(`  existing docs read: ${existing}`);
  console.log(`  to UPDATE (changed): ${toUpdate.length}`);
  console.log(`  to ADD (new):        ${toAdd.length}`);
  console.log(`  in DB, not in build: ${missingFromBuild} (left as-is)`);
  if (sampleDiffs.length) console.log(`  e.g. changing: ${sampleDiffs.join(" · ")}`);

  const writes = [...toUpdate, ...toAdd];
  if (!COMMIT) {
    console.log(`\n✓ DRY RUN. ${writes.length} docs would be written. Re-run with --commit.`);
    process.exit(0);
  }
  if (writes.length === 0) {
    console.log("\n✓ Nothing to write — the database is already in sync.");
    process.exit(0);
  }

  // 4. Write only the delta, batched + paced.
  let written = 0;
  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = store.batch();
    for (const rec of writes.slice(i, i + BATCH)) batch.set(col.doc(rec.id), rec);
    await commitWithRetry(batch);
    written += Math.min(BATCH, writes.length - i);
    if (DELAY_MS) await sleep(DELAY_MS);
  }
  // Keep the counter fresh (add() count changes the total).
  await store.collection("meta").doc("clinics").set({ count: next.size, updatedAt: Date.now() });
  console.log(`\n✓ Synced: ${toUpdate.length} updated, ${toAdd.length} added (${written} writes). meta count = ${next.size}.`);
  process.exit(0);
}

async function commitWithRetry(b: FirebaseFirestore.WriteBatch, attempt = 0): Promise<void> {
  try {
    await b.commit();
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code !== undefined && [4, 8, 10, 13, 14].includes(code) && attempt < 6) {
      const wait = Math.min(30000, 1000 * 2 ** attempt);
      console.warn(`  batch retry ${attempt + 1} (code ${code}); waiting ${wait}ms…`);
      await sleep(wait);
      return commitWithRetry(b, attempt + 1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
