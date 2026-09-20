/**
 * Stage no-name clinics out of the live `clinics` collection for offline
 * verification.
 *
 * Selects every live clinic doc whose `name` is blank, writes the FULL records
 * (all fields) to "Practitioner List/to be verified.csv" as a durable backup,
 * then — only with --commit — deletes those docs from Firestore in batches.
 * The CSV is written from the same live query used for the delete, so it is an
 * exact, re-importable copy of what gets removed.
 *
 * Run:
 *   npx tsx scripts/stage-unnamed.ts            # EXPORT ONLY — writes CSV, no delete
 *   npx tsx scripts/stage-unnamed.ts --commit   # writes CSV, then deletes those docs
 *
 * Firebase Admin creds come from .env.local.
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

loadEnvConfig(process.cwd());
const COMMIT = process.argv.includes("--commit");
const OUT = path.join(process.cwd(), "Practitioner List", "to be verified.csv");

const COLUMNS = [
  "id", "name", "address", "suburb", "state", "postcode", "phone", "fax",
  "email", "website", "lat", "lng", "geohash", "sources", "bookable",
  "billingType", "doctorCount", "types",
];

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) || typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function db() {
  const { FIREBASE_ADMIN_PROJECT_ID: p, FIREBASE_ADMIN_CLIENT_EMAIL: e, FIREBASE_ADMIN_PRIVATE_KEY: k } =
    process.env;
  if (!p || !e || !k) { console.error("✗ Missing Firebase Admin credentials in .env.local."); process.exit(1); }
  if (!getApps().length)
    initializeApp({ credential: cert({ projectId: p, clientEmail: e, privateKey: k.replace(/\\n/g, "\n") }) });
  return getFirestore();
}

async function main() {
  const store = db();
  const col = store.collection("clinics");

  console.log(`Querying live clinics with blank name (project ${process.env.FIREBASE_ADMIN_PROJECT_ID})…`);
  const snap = await col.where("name", "==", "").get();
  const docs = snap.docs;
  console.log(`  found ${docs.length} blank-name docs.`);

  // Write the full-fidelity CSV backup.
  const header = COLUMNS.join(",") + "\n";
  const lines = docs.map((d) => {
    const data = d.data();
    return COLUMNS.map((c) => cell(c === "id" ? d.id : data[c])).join(",");
  });
  fs.writeFileSync(OUT, header + lines.join("\n") + (lines.length ? "\n" : ""));
  console.log(`  ✓ wrote ${docs.length} records -> ${OUT}`);

  if (!COMMIT) {
    console.log("\nEXPORT ONLY — nothing deleted. Re-run with --commit to delete these docs from Firestore.");
    process.exit(0);
  }

  let deleted = 0;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = store.batch();
    for (const d of docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
    deleted += Math.min(400, docs.length - i);
    if (deleted % 2000 === 0 || deleted === docs.length) console.log(`  …deleted ${deleted}/${docs.length}`);
  }
  console.log(`\n✓ Deleted ${deleted} blank-name docs from live Firestore. Backup safe in ${OUT}.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
