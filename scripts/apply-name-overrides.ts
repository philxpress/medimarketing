/**
 * Write recovered clinic names (name_overrides.csv) into Firestore.
 *
 * Verification recovers names for no-name clinics; they're stored durably in
 * "Practitioner List/name_overrides.csv" (clinic_id,name,source) — build-clinics.py
 * applies them on rebuild, and this script pushes them straight to the live
 * `clinics` docs so the update shows immediately without a full re-sync. It only
 * sets `name` (merge), so nothing else is touched. Idempotent.
 *
 * Run:
 *   npx tsx scripts/apply-name-overrides.ts            # DRY RUN — counts only
 *   npx tsx scripts/apply-name-overrides.ts --commit   # writes names
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

loadEnvConfig(process.cwd());
const COMMIT = process.argv.includes("--commit");
const CSV = path.join(process.cwd(), "scripts", "data", "name_overrides.csv");

// Minimal CSV parse (handles quoted fields with commas).
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = splitLine(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = splitLine(l);
    return Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ""]));
  });
}
function splitLine(l: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) {
      if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
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
  if (!fs.existsSync(CSV)) {
    console.error(`✗ ${CSV} not found.`);
    process.exit(1);
  }
  const rows = parseCsv(fs.readFileSync(CSV, "utf-8")).filter((r) => r.clinic_id && r.name);
  console.log(`name overrides — ${COMMIT ? "COMMIT" : "DRY RUN"} — ${rows.length} names`);
  if (!COMMIT) {
    rows.slice(0, 10).forEach((r) => console.log(`  ${r.clinic_id}  ${r.name}`));
    console.log("Re-run with --commit to write.");
    process.exit(0);
  }
  const store = db();
  const col = store.collection("clinics");
  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = store.batch();
    for (const r of rows.slice(i, i + 500)) {
      batch.set(col.doc(r.clinic_id), { name: r.name, nameSource: r.source || "google" }, { merge: true });
    }
    await batch.commit();
    written += Math.min(500, rows.length - i);
  }
  console.log(`✓ Wrote ${written} clinic names.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
