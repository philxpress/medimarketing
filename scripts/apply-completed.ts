/**
 * Re-insert completed clinic records into live `clinics` and prune them from
 * "Practitioner List/to be verified.csv".
 *
 * Input: scratchpad completed.ndjson — one {id,name,email?,website?,fax?,conf?}
 * per verified record. The full original record is taken from the staged CSV
 * backup; the found name/email/website/fax fill blanks (existing non-blank
 * values are kept), then the whole doc is written back to Firestore with set().
 * Records whose conf is "skip"/"ambiguous" or which have no name are ignored.
 *
 * After a successful --commit, the written ids are removed from the CSV.
 *
 * Run:
 *   npx tsx scripts/apply-completed.ts <completed.ndjson>            # DRY
 *   npx tsx scripts/apply-completed.ts <completed.ndjson> --commit   # write + prune
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

loadEnvConfig(process.cwd());
const COMMIT = process.argv.includes("--commit");
const COMPLETED = process.argv[2];
const CSV = path.join(process.cwd(), "Practitioner List", "to be verified.csv");

function splitLine(l: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out;
}
function parseCsvKeepRaw(text: string) {
  // returns {header, rows: {cells, raw}} splitting on record boundaries (respect quotes/newlines)
  const records: string[] = []; let cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { q = !q; cur += c; }
    else if (c === "\n" && !q) { records.push(cur.replace(/\r$/, "")); cur = ""; }
    else cur += c;
  }
  if (cur.trim()) records.push(cur.replace(/\r$/, ""));
  const header = splitLine(records[0]);
  const rows = records.slice(1).filter((r) => r.length).map((raw) => ({ cells: splitLine(raw), raw }));
  return { header, rows };
}

const num = (v: string) => (v === "" || v == null ? null : Number(v));
function toDoc(header: string[], cells: string[]) {
  const g = (k: string) => cells[header.indexOf(k)] ?? "";
  const jarr = (k: string) => { try { return JSON.parse(g(k) || "[]"); } catch { return []; } };
  return {
    id: g("id"), name: g("name"), address: g("address"), suburb: g("suburb"), state: g("state"),
    postcode: g("postcode"), phone: g("phone"), fax: g("fax"), email: g("email"), website: g("website"),
    lat: num(g("lat")), lng: num(g("lng")), geohash: g("geohash"), sources: jarr("sources"),
    bookable: g("bookable") === "true", billingType: g("billingType"),
    doctorCount: num(g("doctorCount")), types: jarr("types"),
  };
}

function db() {
  const { FIREBASE_ADMIN_PROJECT_ID: p, FIREBASE_ADMIN_CLIENT_EMAIL: e, FIREBASE_ADMIN_PRIVATE_KEY: k } = process.env;
  if (!p || !e || !k) { console.error("✗ Missing Firebase Admin creds."); process.exit(1); }
  if (!getApps().length) initializeApp({ credential: cert({ projectId: p, clientEmail: e, privateKey: k.replace(/\\n/g, "\n") }) });
  return getFirestore();
}

async function main() {
  if (!COMPLETED || !fs.existsSync(COMPLETED)) { console.error(`✗ completed file not found: ${COMPLETED}`); process.exit(1); }
  const completed = fs.readFileSync(COMPLETED, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    .filter((r) => r.name && String(r.name).trim() && !["skip", "ambiguous"].includes(r.conf));
  const byId = new Map(completed.map((r) => [r.id, r]));

  const { header, rows } = parseCsvKeepRaw(fs.readFileSync(CSV, "utf-8"));
  const rowById = new Map(rows.map((r) => [r.cells[header.indexOf("id")], r]));

  const docs: Record<string, unknown>[] = [];
  for (const [id, found] of byId) {
    const row = rowById.get(id);
    if (!row) continue; // already pruned in a prior run
    const doc = toDoc(header, row.cells) as Record<string, string | null | boolean | number | unknown[]>;
    doc.name = found.name;
    doc.nameSource = found.nameSource || "website";
    if (!doc.email && found.email) doc.email = found.email;
    if (!doc.website && found.website) doc.website = found.website;
    if (!doc.fax && found.fax) doc.fax = found.fax;
    docs.push(doc);
  }

  console.log(`${COMMIT ? "COMMIT" : "DRY"} — ${completed.length} completed rows; ${docs.length} match a staged record and will be re-inserted.`);
  docs.slice(0, 8).forEach((d) => console.log(`  ${d.id}  ${d.name}  | ${d.email || "-"} | ${d.website || "-"}`));
  if (!COMMIT) { console.log("\nDRY — nothing written. Add --commit."); process.exit(0); }

  const store = db(); const col = store.collection("clinics");
  let w = 0;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = store.batch();
    for (const d of docs.slice(i, i + 400)) batch.set(col.doc(d.id as string), d);
    await batch.commit(); w += Math.min(400, docs.length - i);
  }
  console.log(`✓ Re-inserted ${w} docs into live clinics.`);

  // prune written ids from the CSV
  const writtenIds = new Set(docs.map((d) => d.id));
  const kept = rows.filter((r) => !writtenIds.has(r.cells[header.indexOf("id")]));
  fs.writeFileSync(CSV, header.join(",") + "\n" + kept.map((r) => r.raw).join("\n") + (kept.length ? "\n" : ""));
  console.log(`✓ Pruned ${writtenIds.size} rows from "to be verified.csv" (${kept.length} remain).`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
