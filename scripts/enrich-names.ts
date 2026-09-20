/**
 * Recover names for no-name clinics via the Google Places API (Text Search New).
 *
 * For each blank-name clinic (from clinics.ndjson) it queries by phone + suburb,
 * accepts the result only when the returned address contains the clinic's own
 * postcode or suburb (guards against a wrong nearby business), and appends the
 * recovered name to scripts/data/name_overrides.csv. Resumable: clinics already
 * in that file are skipped, so re-runs continue where they left off.
 *
 * Cost/quota: uses ONLY Essentials fields (displayName, formattedAddress) → the
 * cheapest Text Search SKU ($32/1000, 10,000 free/month). One billable call per
 * clinic processed; the run prints the call count so you can track the free cap.
 *
 * Run:
 *   npx tsx scripts/enrich-names.ts --limit 20                 # small test
 *   npx tsx scripts/enrich-names.ts --limit 10000              # a month's free tier
 *   npx tsx scripts/enrich-names.ts --limit 3000 --offset 10000
 * Then push the recovered names to the DB:
 *   npx tsx scripts/apply-name-overrides.ts --commit
 *
 * Key comes from GOOGLE_MAPS_API_KEY in .env.local (never hard-coded).
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const arg = (flag: string, def: number) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : def;
};
const LIMIT = arg("--limit", 20);
const OFFSET = arg("--offset", 0);
const DELAY_MS = arg("--delay", 120);
// --dry: print full results for review, write NOTHING (file or DB). In dry mode
// we also request phone + website so the match can be judged; the real run uses
// only the cheaper Essentials fields (name + address).
const DRY = process.argv.includes("--dry");

const NDJSON = path.join(process.cwd(), "Practitioner List", "clinics.ndjson");
const OVERRIDES = path.join(process.cwd(), "scripts", "data", "name_overrides.csv");
const KEY = process.env.GOOGLE_MAPS_API_KEY;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

interface Clinic {
  id: string; name: string; phone: string; suburb: string; state: string; postcode: string;
  address: string;
}

interface Found {
  status: "matched" | "noresult" | "rejected";
  name?: string;
  address?: string;
  phone?: string;
  website?: string;
}

async function searchName(clinic: Clinic): Promise<Found> {
  const query = [clinic.phone, clinic.suburb, clinic.state].filter(Boolean).join(" ");
  const fields = DRY
    ? "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri"
    : "places.displayName,places.formattedAddress";
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY!,
      "X-Goog-FieldMask": fields,
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1, regionCode: "AU" }),
  });
  if (!res.ok) {
    throw new Error(`Places API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    places?: {
      displayName?: { text?: string };
      formattedAddress?: string;
      nationalPhoneNumber?: string;
      websiteUri?: string;
    }[];
  };
  const p = data.places?.[0];
  const base = {
    name: p?.displayName?.text,
    address: p?.formattedAddress,
    phone: p?.nationalPhoneNumber,
    website: p?.websiteUri,
  };
  if (!p?.displayName?.text) return { status: "noresult", ...base };
  // Accept only if the returned address ties back to our postcode or suburb.
  const addr = (p.formattedAddress ?? "").toLowerCase();
  const ok =
    (clinic.postcode && addr.includes(clinic.postcode.toLowerCase())) ||
    (clinic.suburb && addr.includes(clinic.suburb.toLowerCase()));
  return { status: ok ? "matched" : "rejected", ...base };
}

async function main() {
  if (!KEY) {
    console.error("✗ GOOGLE_MAPS_API_KEY not set in .env.local.");
    process.exit(1);
  }
  if (!fs.existsSync(NDJSON)) {
    console.error(`✗ ${NDJSON} not found. Run: python scripts/build-clinics.py`);
    process.exit(1);
  }

  // Already-recovered ids (skip → resumable, no double billing).
  const done = new Set<string>();
  if (fs.existsSync(OVERRIDES)) {
    for (const line of fs.readFileSync(OVERRIDES, "utf-8").split(/\r?\n/).slice(1)) {
      const id = line.split(",")[0]?.trim();
      if (id) done.add(id);
    }
  } else {
    fs.writeFileSync(OVERRIDES, "clinic_id,name,source\n");
  }

  const candidates = fs
    .readFileSync(NDJSON, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Clinic)
    .filter((c) => (!c.name || !c.name.trim()) && c.phone && !done.has(c.id))
    .slice(OFFSET, OFFSET + LIMIT);

  console.log(
    `${DRY ? "DRY RUN (no writes) — " : ""}Enriching ${candidates.length} clinics ` +
      `(limit ${LIMIT}, offset ${OFFSET}). Each = 1 Places call.\n`
  );
  const phoneKey = (s: string) => (s || "").replace(/\D/g, "").slice(-8);

  let calls = 0, matched = 0, noresult = 0, rejected = 0;
  for (const c of candidates) {
    try {
      const r = await searchName(c);
      calls++;
      if (DRY) {
        const decision =
          r.status === "matched" ? "✓ ACCEPT" : r.status === "rejected" ? "✗ REJECT (addr mismatch)" : "— no result";
        const phoneMatch =
          r.phone && phoneKey(r.phone) === phoneKey(c.phone) ? "  [phone MATCHES]" : r.phone ? "  [phone differs]" : "";
        console.log(`${decision}`);
        console.log(`   ours:  ${c.phone} | ${c.address}`);
        console.log(`   found: ${r.name ?? "—"} | ${r.address ?? "—"}${phoneMatch}`);
        if (r.website) console.log(`          ${r.website}`);
        console.log("");
      } else if (r.status === "matched" && r.name) {
        fs.appendFileSync(OVERRIDES, `${c.id},${csvCell(r.name)},google-places\n`);
      }
      if (r.status === "matched") matched++;
      else if (r.status === "noresult") noresult++;
      else rejected++;
    } catch (err) {
      console.error(`\n✗ Stopped after ${calls} calls: ${err}`);
      break;
    }
    if (!DRY && calls % 100 === 0) console.log(`  …${calls} calls (${matched} names)`);
    await sleep(DELAY_MS);
  }

  console.log(
    `${DRY ? "DRY RUN — " : ""}${calls} Places calls — matched ${matched}, ` +
      `no result ${noresult}, rejected (address mismatch) ${rejected}.` +
      (DRY ? " Nothing written." : " Names appended to name_overrides.csv.")
  );
  if (!DRY) console.log("Next: npx tsx scripts/apply-name-overrides.ts --commit");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
