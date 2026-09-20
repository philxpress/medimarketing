/**
 * Fast liveness pre-pass over the staged website records, so dead domains can
 * be removed before the (pure-browser) name-completion run — a dead site would
 * otherwise abort a browser batch midway.
 *
 * Reads the website work-list, fetches each URL concurrently, and classifies:
 *   dead   — DNS/connection failure, or 404/410/451 (definitely gone)
 *   parked — domain-for-sale / parking page
 *   keep   — everything else (200 OK, or 403/429/5xx/timeout: a bare fetch may
 *            be blocked but the real browser will load it — do NOT drop these)
 * For records with no email it also tries to pre-grab one (homepage + /contact).
 *
 * Writes scratchpad website_status.ndjson: {id,website,verdict,reason,pre_email}
 *
 * Run: npx tsx scripts/website-liveness.ts <work-list.ndjson> <out-status.ndjson> [--conc 20]
 */
import fs from "node:fs";

const [, , INPUT, OUTPUT] = process.argv;
const arg = (f: string, d: number) => { const i = process.argv.indexOf(f); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const CONC = arg("--conc", 20);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const PARK = [
  "domain is for sale", "buy this domain", "this domain is for sale", "domain for sale",
  "sedoparking", "hugedomains", "parking-lander", "godaddy.com/domainfind",
  "domain has expired", "website is parked", "is for sale.",
];
const DEAD_STATUS = new Set([404, 410, 451]);

async function fetchText(url: string, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": UA } });
    const body = await res.text().catch(() => "");
    return { status: res.status, body, err: "" };
  } catch (e) {
    return { status: 0, body: "", err: String((e as Error)?.name || e).slice(0, 40) };
  } finally { clearTimeout(t); }
}

function emails(html: string, host: string): string[] {
  const s = new Set<string>();
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) s.add(decodeURIComponent(m[1]).toLowerCase());
  for (const m of html.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) s.add(m[0].toLowerCase());
  const bad = /(example|sentry|wixpress|\.png|\.jpg|\.gif|\.svg|\.webp|@2x|u003e|your-?email|domain\.com|email@)/i;
  const root = host.replace(/^www\./, "");
  return [...s].filter((e) => !bad.test(e)).sort((a, b) => Number(b.endsWith(root)) - Number(a.endsWith(root)));
}

async function classify(rec: { website: string; email: string }) {
  let url = rec.website.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  let host = ""; try { host = new URL(url).host; } catch { return { verdict: "dead", reason: "bad url", pre_email: "" }; }

  const r = await fetchText(url);
  if (r.status === 0) {
    // one retry for transient errors
    const r2 = await fetchText(url, 15000);
    if (r2.status === 0) return { verdict: "dead", reason: r2.err || "no response", pre_email: "" };
    Object.assign(r, r2);
  }
  if (DEAD_STATUS.has(r.status)) return { verdict: "dead", reason: `HTTP ${r.status}`, pre_email: "" };
  const low = r.body.toLowerCase();
  if (r.body && PARK.some((p) => low.includes(p)) && r.body.length < 4000)
    return { verdict: "parked", reason: "parking page", pre_email: "" };

  let pre = "";
  if (!rec.email && r.status < 400 && r.body) {
    let es = emails(r.body, host);
    if (!es.length) {
      for (const p of ["/contact", "/contact-us"]) {
        const cr = await fetchText(new URL(p, url).toString(), 10000);
        if (cr.status && cr.status < 400) { es = emails(cr.body, host); if (es.length) break; }
      }
    }
    pre = es[0] ?? "";
  }
  return { verdict: r.status < 400 ? "live" : "keep", reason: `HTTP ${r.status || r.err}`, pre_email: pre };
}

async function main() {
  const recs = fs.readFileSync(INPUT, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  console.log(`Liveness pass over ${recs.length} sites (concurrency ${CONC})…`);
  const out = fs.createWriteStream(OUTPUT);
  const counts: Record<string, number> = {};
  let done = 0, preEmails = 0;

  let idx = 0;
  async function worker() {
    while (idx < recs.length) {
      const rec = recs[idx++];
      const c = await classify(rec);
      counts[c.verdict] = (counts[c.verdict] || 0) + 1;
      if (c.pre_email) preEmails++;
      out.write(JSON.stringify({ id: rec.id, website: rec.website, verdict: c.verdict, reason: c.reason, pre_email: c.pre_email }) + "\n");
      if (++done % 250 === 0) console.log(`  …${done}/${recs.length}  ${JSON.stringify(counts)}`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  out.end();
  console.log(`\nDone ${done}. Verdicts: ${JSON.stringify(counts)}. Pre-grabbed ${preEmails} emails.`);
  console.log(`Status -> ${OUTPUT}`);
  const keep = (counts.live || 0) + (counts.keep || 0);
  console.log(`Browser work-list (live+keep): ${keep}. Removed (dead+parked): ${(counts.dead || 0) + (counts.parked || 0)}.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
