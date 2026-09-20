/**
 * Lightweight email verification for CSV import — cheap, deterministic checks
 * that keep obviously-bad addresses out (and off your sender reputation):
 *   1. RFC-ish syntax.
 *   2. Disposable / throwaway domain blocklist.
 *   3. Domain has MX (or A) records — i.e. can receive mail at all.
 *
 * MX lookups are cached per-domain and only run for a bounded number of unique
 * domains so a large import stays within the request budget; beyond that cap we
 * accept syntactically-valid, non-disposable addresses without the DNS check.
 */
import "server-only";
import { resolveMx, resolve4 } from "dns/promises";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A small, high-signal set of disposable providers. Extend as needed. */
const DISPOSABLE = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "yopmail.com",
  "trashmail.com",
  "getnada.com",
  "sharklasers.com",
  "dispostable.com",
  "fakeinbox.com",
  "maildrop.cc",
]);

export type RejectReason = "syntax" | "disposable" | "no-mx";

const mxCache = new Map<string, boolean>();

async function domainAcceptsMail(domain: string): Promise<boolean> {
  const cached = mxCache.get(domain);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    const mx = await resolveMx(domain);
    ok = mx.length > 0;
  } catch {
    // No MX — fall back to an A record (some domains receive mail without MX).
    try {
      const a = await resolve4(domain);
      ok = a.length > 0;
    } catch {
      ok = false;
    }
  }
  mxCache.set(domain, ok);
  return ok;
}

export interface VerifyOptions {
  /** Max unique domains to MX-check in one pass (0 disables DNS checks). */
  maxDnsDomains?: number;
}

export interface VerifyResult {
  valid: boolean;
  reason?: RejectReason;
}

/**
 * Verify a batch of emails. Returns a map keyed by the (lowercased) email.
 * Syntax + disposable are always applied; MX is applied to the first
 * `maxDnsDomains` unique domains (default 300).
 */
export async function verifyEmails(
  emails: string[],
  opts: VerifyOptions = {}
): Promise<Map<string, VerifyResult>> {
  const maxDns = opts.maxDnsDomains ?? 300;
  const out = new Map<string, VerifyResult>();

  // First pass: syntax + disposable, and collect domains needing an MX check.
  const domains = new Set<string>();
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email || out.has(email)) continue;
    if (!EMAIL_RE.test(email)) {
      out.set(email, { valid: false, reason: "syntax" });
      continue;
    }
    const domain = email.split("@")[1];
    if (DISPOSABLE.has(domain)) {
      out.set(email, { valid: false, reason: "disposable" });
      continue;
    }
    domains.add(domain);
  }

  // MX-check a bounded number of unique domains, in parallel-ish batches.
  const toCheck = [...domains].slice(0, maxDns);
  const checkable = new Set(toCheck);
  const CONC = 20;
  for (let i = 0; i < toCheck.length; i += CONC) {
    await Promise.all(toCheck.slice(i, i + CONC).map((d) => domainAcceptsMail(d)));
  }

  // Second pass: verdict for the syntactically-valid, non-disposable addresses.
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email || out.has(email)) continue;
    const domain = email.split("@")[1];
    if (checkable.has(domain) && mxCache.get(domain) === false) {
      out.set(email, { valid: false, reason: "no-mx" });
    } else {
      out.set(email, { valid: true });
    }
  }
  return out;
}
