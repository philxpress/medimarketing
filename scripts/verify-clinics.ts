/**
 * Verify no-name clinics against Google Places (phone reverse-lookup).
 *
 * For each blank-name clinic with a phone:
 *   1. Places Text Search, phone-only query.
 *   2. Accept only if the returned business's phone matches ours (last-8 digits)
 *      → VERIFIED: capture name + current address + website.
 *   3. Otherwise → QUESTIONABLE (no Places business with that phone, or mismatch).
 *
 * Writes review files only — NO database writes:
 *   Practitioner List/verify_verified.csv     (clinic_id,name,google_address,website,our_address,phone)
 *   Practitioner List/verify_questionable.csv (clinic_id,phone,our_address,note)
 * Resumable: clinics already in either file are skipped (no double billing).
 *
 * Cost: one Places call per clinic; the phone field puts it on a higher SKU
 * than name-only. The run prints the call count.
 *
 * Run:  npx tsx scripts/verify-clinics.ts --limit 1000 [--offset N] [--delay 120]
 * Key from GOOGLE_MAPS_API_KEY in .env.local.
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const argN = (flag: string, def: number) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : def;
};
const LIMIT = argN("--limit", 200);
const OFFSET = argN("--offset", 0);
const DELAY_MS = argN("--delay", 120);

const NDJSON = path.join(process.cwd(), "Practitioner List", "clinics.ndjson");
const VERIFIED = path.join(process.cwd(), "Practitioner List", "verify_verified.csv");
const QUESTIONABLE = path.join(process.cwd(), "Practitioner List", "verify_questionable.csv");
const KEY = process.env.GOOGLE_MAPS_API_KEY;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cell = (v: string) => (/[",\n]/.test(v ?? "") ? `"${(v ?? "").replace(/"/g, '""')}"` : v ?? "");
const p8 = (s: string) => (s || "").replace(/\D/g, "").slice(-8);

interface Clinic {
  id: string; name: string; phone: string; address: string;
  suburb: string; state: string; postcode: string;
}

async function lookup(phone: string) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY!,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri",
    },
    body: JSON.stringify({ textQuery: phone, maxResultCount: 1, regionCode: "AU" }),
  });
  if (!res.ok) throw new Error(`Places ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = (await res.json()) as {
    places?: {
      displayName?: { text?: string };
      formattedAddress?: string;
      nationalPhoneNumber?: string;
      websiteUri?: string;
    }[];
  };
  return d.places?.[0];
}

function loadDone(): Set<string> {
  const done = new Set<string>();
  for (const f of [VERIFIED, QUESTIONABLE]) {
    if (fs.existsSync(f)) {
      for (const line of fs.readFileSync(f, "utf-8").split(/\r?\n/).slice(1)) {
        const id = line.split(",")[0]?.trim();
        if (id) done.add(id);
      }
    }
  }
  return done;
}

async function main() {
  if (!KEY) { console.error("✗ GOOGLE_MAPS_API_KEY not set in .env.local."); process.exit(1); }
  if (!fs.existsSync(NDJSON)) { console.error(`✗ ${NDJSON} not found.`); process.exit(1); }
  if (!fs.existsSync(VERIFIED))
    fs.writeFileSync(VERIFIED, "clinic_id,name,google_address,website,our_address,phone\n");
  if (!fs.existsSync(QUESTIONABLE))
    fs.writeFileSync(QUESTIONABLE, "clinic_id,phone,our_address,note\n");

  const done = loadDone();
  const candidates = fs
    .readFileSync(NDJSON, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Clinic)
    .filter((c) => (!c.name || !c.name.trim()) && c.phone && !done.has(c.id))
    .slice(OFFSET, OFFSET + LIMIT);

  console.log(`Verifying ${candidates.length} clinics (limit ${LIMIT}, offset ${OFFSET}). 1 Places call each.`);

  let calls = 0, verified = 0, questionable = 0;
  for (const c of candidates) {
    const ourPhones = new Set(c.phone.split(/[;,]/).map(p8).filter(Boolean));
    const queryPhone = c.phone.split(/[;,]/)[0].trim();
    try {
      const p = await lookup(queryPhone);
      calls++;
      if (p?.displayName?.text && ourPhones.has(p8(p.nationalPhoneNumber ?? ""))) {
        fs.appendFileSync(
          VERIFIED,
          [c.id, p.displayName.text, p.formattedAddress ?? "", p.websiteUri ?? "", c.address, c.phone]
            .map(cell).join(",") + "\n"
        );
        verified++;
      } else {
        const note = p?.displayName?.text
          ? `mismatch: ${p.displayName.text} ph ${p.nationalPhoneNumber ?? "?"}`
          : "no Places business with this phone";
        fs.appendFileSync(QUESTIONABLE, [c.id, c.phone, c.address, note].map(cell).join(",") + "\n");
        questionable++;
      }
    } catch (err) {
      console.error(`\n✗ Stopped after ${calls} calls: ${err}`);
      break;
    }
    if (calls % 100 === 0)
      console.log(`  …${calls} calls — ${verified} verified, ${questionable} questionable`);
    await sleep(DELAY_MS);
  }

  console.log(
    `\n✓ ${calls} Places calls — ${verified} verified, ${questionable} questionable ` +
      `(${calls ? Math.round((verified / calls) * 100) : 0}% verified).`
  );
  console.log(`  verified   -> ${VERIFIED}`);
  console.log(`  questionable -> ${QUESTIONABLE}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
