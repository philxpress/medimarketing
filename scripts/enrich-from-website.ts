/**
 * Complete staged no-name clinics that HAVE a website, by visiting the site.
 *
 * For each record in "Practitioner List/to be verified.csv" that has a website:
 *   1. Fetch the site (a real HTTP visit; follows redirects, 12s timeout).
 *   2. Classify: LIVE / DEAD (network error, 4xx/5xx) / PARKED (domain-for-sale).
 *   3. For LIVE sites, extract a business name (og:site_name / <title>) and,
 *      when the record has no email, an email (homepage + /contact fallback).
 *
 * Modes:
 *   npx tsx scripts/enrich-from-website.ts --limit 20            # DRY: print only
 *   npx tsx scripts/enrich-from-website.ts --limit 20 --offset 40
 *   npx tsx scripts/enrich-from-website.ts --all --commit        # write + update DB
 *
 * --commit writes verified rows to "Practitioner List/verified.csv", re-inserts
 * them into live `clinics` (merge; fills blanks, keeps existing values), and
 * rewrites "to be verified.csv" without the completed rows.
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const arg = (flag: string, def: number) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : def;
};
const LIMIT = process.argv.includes("--all") ? Infinity : arg("--limit", 20);
const OFFSET = arg("--offset", 0);
const COMMIT = process.argv.includes("--commit");

const DIR = path.join(process.cwd(), "Practitioner List");
const TBV = path.join(DIR, "to be verified.csv");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- minimal CSV ----
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { cur.push(cell); cell = ""; }
    else if (c === "\n") { cur.push(cell); rows.push(cur); cur = []; cell = ""; }
    else if (c === "\r") { /* skip */ }
    else cell += c;
  }
  if (cell.length || cur.length) { cur.push(cell); rows.push(cur); }
  const head = rows.shift()!;
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const PARK_SIGNS = [
  "domain is for sale", "buy this domain", "this domain is for sale", "domain for sale",
  "sedoparking", "hugedomains", "parking-lander", "domainparking", "godaddy.com/domainfind",
  "the domain you are looking for", "domain has expired", "website is parked",
];

function cleanName(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim();
  // drop trailing/leading boilerplate segments split by | or - or – or •
  const parts = t.split(/\s*[|•–—]\s*|\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) {
    // prefer the longest segment that isn't a generic word
    const generic = /^(home|welcome|contact( us)?|about( us)?|homepage|index)$/i;
    const cands = parts.filter((p) => !generic.test(p));
    t = (cands.sort((a, b) => b.length - a.length)[0] || parts[0]).trim();
  }
  return t.slice(0, 120);
}

function extractName(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
  if (og?.[1]) return cleanName(og[1]);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title?.[1]) return cleanName(title[1]);
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) return cleanName(h1[1].replace(/<[^>]+>/g, " "));
  return "";
}

function extractEmails(html: string, siteHost: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) found.add(m[1].toLowerCase());
  for (const m of html.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) found.add(m[0].toLowerCase());
  const bad = /(example|sentry|wixpress|\.png|\.jpg|\.gif|\.svg|\.webp|@sentry|@2x|u003e|domain\.com)/i;
  const emails = [...found].filter((e) => !bad.test(e));
  const root = siteHost.replace(/^www\./, "");
  emails.sort((a, b) => Number(b.endsWith(root)) - Number(a.endsWith(root)));
  return emails;
}

async function fetchText(url: string): Promise<{ ok: boolean; status: number; finalUrl: string; body: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": UA } });
    const body = await res.text();
    return { ok: res.ok, status: res.status, finalUrl: res.url, body };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

type Verdict = "LIVE" | "DEAD" | "PARKED";
async function visit(rawUrl: string, hasEmail: boolean) {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const r = await fetchText(url);
  if (!r) return { verdict: "DEAD" as Verdict, reason: "no response / timeout", name: "", email: "" };
  if (r.status >= 400) return { verdict: "DEAD" as Verdict, reason: `HTTP ${r.status}`, name: "", email: "" };
  const low = r.body.toLowerCase();
  if (r.body.length < 600 && PARK_SIGNS.some((s) => low.includes(s)))
    return { verdict: "PARKED" as Verdict, reason: "parked/short", name: "", email: "" };
  if (PARK_SIGNS.some((s) => low.includes(s)))
    return { verdict: "PARKED" as Verdict, reason: "parking signal", name: "", email: "" };

  const host = new URL(r.finalUrl).host;
  const name = extractName(r.body);
  let emails = hasEmail ? [] : extractEmails(r.body, host);
  // /contact fallback for email
  if (!hasEmail && emails.length === 0) {
    for (const p of ["/contact", "/contact-us", "/contact-us/"]) {
      const cr = await fetchText(new URL(p, r.finalUrl).toString());
      if (cr && cr.status < 400) { emails = extractEmails(cr.body, host); if (emails.length) break; }
    }
  }
  return { verdict: "LIVE" as Verdict, reason: `HTTP ${r.status}`, name, email: emails[0] ?? "" };
}

async function main() {
  const rows = parseCsv(fs.readFileSync(TBV, "utf-8"));
  const withWeb = rows.filter((r) => (r.website || "").trim());
  const slice = withWeb.slice(OFFSET, OFFSET === 0 && LIMIT === Infinity ? undefined : OFFSET + LIMIT);
  console.log(
    `${COMMIT ? "COMMIT" : "DRY"} — ${withWeb.length} records have a website; processing ${slice.length} ` +
      `(offset ${OFFSET}${LIMIT === Infinity ? ", all" : `, limit ${LIMIT}`}).\n`
  );

  let live = 0, dead = 0, parked = 0, names = 0, emails = 0;
  for (const c of slice) {
    const hasEmail = Boolean((c.email || "").trim());
    const v = await visit(c.website, hasEmail);
    if (v.verdict === "LIVE") live++; else if (v.verdict === "PARKED") parked++; else dead++;
    if (v.verdict === "LIVE" && v.name) names++;
    if (v.verdict === "LIVE" && v.email) emails++;
    const mark = v.verdict === "LIVE" ? "✓" : v.verdict === "PARKED" ? "▢" : "✗";
    console.log(`${mark} ${v.verdict.padEnd(6)} ${c.website}`);
    console.log(`     ${c.address}`);
    if (v.verdict === "LIVE") console.log(`     name: ${v.name || "—"}   email: ${v.email || (hasEmail ? "(already set)" : "—")}`);
    else console.log(`     (${v.reason})`);
    await sleep(50);
  }
  console.log(
    `\nSummary: ${live} live, ${parked} parked, ${dead} dead. ` +
      `Of live: ${names} names, ${emails} new emails.`
  );
  console.log(COMMIT ? "\n(COMMIT wiring added in next step once sample looks good.)" : "\nDRY run — nothing written.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
