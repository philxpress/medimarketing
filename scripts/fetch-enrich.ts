/**
 * Fetch-based completion of the live-website staged clinics: for each site,
 * pull the best business name + an email (when the record has none), and tag
 * the name high/low confidence so only the low ones need a browser spot-check.
 *
 * Name candidates (scored): og:site_name, og/twitter:title, <title> (cleaned),
 * <h1>, and logo/header <img alt>. Score rewards a "Dr" token, overlap with the
 * domain, and clean Title-Case; penalises taglines/generic words. conf=high when
 * the winner scores well, else low (-> browser spot-check).
 *
 * Reads the live-only work-list, skips ids already in completed.ndjson.
 * Appends to fetch_completed.ndjson {id,name,email,website,conf,name_source}.
 *
 * Run: npx tsx scripts/fetch-enrich.ts <worklist.ndjson> <completed.ndjson> <out.ndjson> [--conc 20]
 */
import fs from "node:fs";

const [, , WORKLIST, COMPLETED, OUT] = process.argv;
const arg = (f: string, d: number) => { const i = process.argv.indexOf(f); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const CONC = arg("--conc", 20);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#039": "'", "#8217": "’", "#8216": "‘", "#8211": "–", "#8212": "—", "#38": "&" };
function decode(s: string) {
  return s.replace(/&(#?[\w]+);/g, (m, e) => {
    if (ENT[e]) return ENT[e];
    if (/^#x[0-9a-f]+$/i.test(e)) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (/^#\d+$/.test(e)) return String.fromCodePoint(+e.slice(1));
    return m;
  });
}
function clean(s: string) {
  let t = decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  t = t.replace(/^(why choose|welcome to|home\s*[-|]\s*)/i, "").trim();
  t = t.replace(/\?+\s*$/, "").trim();
  return t;
}
const TITLE_RE = /\b(dr|prof|a\/prof|assoc\.? prof|associate professor|mr|ms|mrs|dame|sir)\.?\b/i;

const GENERIC = /^(home|welcome|contact( us)?|about( us)?|homepage|index|menu|logo|dark logo|light logo|image|book( now)?|appointments?)$/i;
const TAGLINE = /(experienced|leading|trusted|expert|best |welcome to|committed to|providing|assessment and treatment|your .* in |world-class|state-of-the-art|comprehensive care|quality care)/i;

function bestSegment(raw: string): string {
  const t = clean(raw);
  const parts = t.split(/\s*[|•·–—]\s*|\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return t.slice(0, 120);
  const cand = parts.filter((p) => !GENERIC.test(p));
  return (cand.sort((a, b) => b.length - a.length)[0] || parts[0]).slice(0, 120);
}

function domainTokens(host: string): string[] {
  const h = host.replace(/^www\./, "").split(".")[0];
  return h.split(/[^a-z]+/i).filter((x) => x.length >= 4).map((x) => x.toLowerCase());
}

function scoreName(cand: string, tokens: string[]): number {
  if (!cand || GENERIC.test(cand)) return -5;
  const low = cand.toLowerCase(), nospace = low.replace(/[^a-z]/g, "");
  const titled = TITLE_RE.test(cand);
  const overlap = tokens.some((t) => nospace.includes(t));
  let s = 0;
  if (titled) s += 3;
  if (overlap) s += 3;
  const words = cand.split(/\s+/);
  if (words.length >= 1 && words.length <= 6 && /^[A-Z]/.test(cand)) s += 1;
  if (TAGLINE.test(cand)) s -= 4;
  if (cand.length > 60) s -= 2;
  if (/\b(psychology|psychologist|clinic|medical|surgery|surgeons?|orthopaed|urology|gynaecolog|dental|physio|health|centre|specialist|paediatric|cardiolog|neurolog|dermatolog|fertility)\b/i.test(cand)) s += 1;
  // Precision gate: without a domain match or a personal title, cap below the
  // high threshold so bare role phrases ("Clinical Psychologist") stay low.
  if (!overlap && !titled) s = Math.min(s, 1);
  return s;
}

async function fetchText(url: string, ms = 12000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": UA } });
    return { status: r.status, url: r.url, body: await r.text().catch(() => "") };
  } catch { return { status: 0, url, body: "" }; } finally { clearTimeout(t); }
}

function emails(html: string, host: string): string[] {
  const s = new Set<string>();
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) s.add(decodeURIComponent(m[1]).toLowerCase());
  for (const m of html.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) s.add(m[0].toLowerCase());
  const bad = /(example|sentry|wixpress|\.png|\.jpg|\.gif|\.svg|\.webp|@2x|u003e|your-?email|domain\.com|email@|\.wixpress)/i;
  const root = host.replace(/^www\./, "");
  return [...s].filter((e) => !bad.test(e)).sort((a, b) => Number(b.endsWith(root)) - Number(a.endsWith(root)));
}

function pickName(html: string, host: string) {
  const tokens = domainTokens(host);
  const cands: [string, string][] = []; // [source, value]
  const meta = (prop: string) => { const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i")); return m?.[1]; };
  const og = meta("og:site_name"); if (og) cands.push(["og:site_name", bestSegment(og)]);
  const ogt = meta("og:title") || meta("twitter:title"); if (ogt) cands.push(["og:title", bestSegment(ogt)]);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); if (title?.[1]) cands.push(["title", bestSegment(title[1])]);
  for (const m of html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)) { const v = clean(m[1]); if (v) cands.push(["h1", v.slice(0, 120)]); }
  for (const m of html.matchAll(/<img[^>]*\balt=["']([^"']+)["']/gi)) { const v = clean(m[1]); if (v && !GENERIC.test(v) && v.length >= 3) cands.push(["imgalt", v.slice(0, 120)]); }
  let best = "", bestScore = -99, src = "";
  for (const [source, v] of cands) { const sc = scoreName(v, tokens); if (sc > bestScore) { bestScore = sc; best = v; src = source; } }
  return { name: best, score: bestScore, source: src };
}

async function main() {
  const done = new Set(fs.existsSync(COMPLETED) ? fs.readFileSync(COMPLETED, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l).id) : []);
  const recs = fs.readFileSync(WORKLIST, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((c: {id:string}) => !done.has(c.id));
  const out = fs.createWriteStream(OUT, { flags: "a" });
  console.log(`Fetch-enriching ${recs.length} sites (conc ${CONC})…`);
  let idx = 0, hi = 0, lo = 0, gotEmail = 0, ndone = 0;
  async function worker() {
    while (idx < recs.length) {
      const c = recs[idx++];
      let url = c.website.trim(); if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      let host = ""; try { host = new URL(url).host; } catch {}
      const r = await fetchText(url);
      let name = "", score = -99, source = "none", email = "";
      if (r.status && r.status < 400 && r.body) {
        const pn = pickName(r.body, host); name = pn.name; score = pn.score; source = pn.source;
        if (!c.email) { let es = emails(r.body, host);
          if (!es.length) for (const p of ["/contact", "/contact-us"]) { const cr = await fetchText(new URL(p, url).toString(), 9000); if (cr.status && cr.status < 400) { es = emails(cr.body, host); if (es.length) break; } }
          email = es[0] ?? ""; if (email) gotEmail++;
        }
      }
      // Demote leftovers that read like taglines or a bare domain to spot-check.
      const looksDomain = /\.[a-z]{2,}(\.[a-z]{2,})?$/i.test(name) && !name.includes(" ");
      const dirty = name.includes("|") || looksDomain;
      const conf = name && score >= 2 && !dirty ? "high" : "low";
      if (conf === "high") hi++; else lo++;
      out.write(JSON.stringify({ id: c.id, name, email, website: "", conf, name_source: source, score }) + "\n");
      if (++ndone % 250 === 0) console.log(`  …${ndone}/${recs.length}  high ${hi} low ${lo}`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  out.end();
  console.log(`\nDone ${ndone}. high-confidence names ${hi}, low ${lo}. Emails grabbed ${gotEmail}.`);
  console.log(`-> ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
