/**
 * Bounce detection. Sending happens through the user's own mailbox, so bounces
 * (NDRs / "Delivery Status Notification" messages from mailer-daemon) land back
 * in that mailbox. When the mailbox granted read scope we scan recent NDRs,
 * extract the failed recipient addresses, and classify hard vs soft failures.
 *
 * Hard bounces are what callers act on: suppress the address and mark the
 * matching recipient rows "bounced".
 */
import "server-only";
import type { Integration } from "@/lib/types";
import { gmailClientFor } from "@/lib/email/providers/gmail";
import { graphAccessTokenFor } from "@/lib/email/providers/microsoft";

export interface BounceHit {
  email: string;
  hard: boolean;
  detail: string;
}

const ADDR_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** Classify a DSN body as a hard (permanent) failure. */
function isHardBounce(text: string): boolean {
  const t = text.toLowerCase();
  // 5.x.x enhanced status or a 5xx SMTP reply = permanent failure.
  if (/\b5\.\d\.\d\b/.test(t)) return true;
  if (/\b55\d\b/.test(t)) return true;
  return (
    t.includes("permanent") ||
    t.includes("does not exist") ||
    t.includes("no such user") ||
    t.includes("user unknown") ||
    t.includes("mailbox unavailable") ||
    t.includes("address rejected") ||
    t.includes("recipient not found")
  );
}

/** Pull failed recipient addresses out of a DSN body/headers. */
function extractRecipients(text: string, selfEmail: string): string[] {
  const found = new Set<string>();
  // Prefer the structured DSN fields when present.
  const finals = text.match(/final-recipient:[^\n]*|x-failed-recipients:[^\n]*/gi) ?? [];
  const scope = finals.length ? finals.join("\n") : text;
  for (const m of scope.matchAll(ADDR_RE)) {
    const addr = m[0].toLowerCase();
    if (addr === selfEmail.toLowerCase()) continue;
    if (addr.includes("mailer-daemon") || addr.includes("postmaster")) continue;
    found.add(addr);
  }
  return [...found];
}

/** Scan a Gmail mailbox for bounce NDRs newer than `sinceMs`. */
async function scanGmail(
  integration: Integration,
  sinceMs: number
): Promise<BounceHit[]> {
  const gmail = gmailClientFor(integration);
  const afterSecs = Math.floor(sinceMs / 1000);
  const q = `(from:mailer-daemon OR from:postmaster OR subject:"Delivery Status Notification" OR subject:"Undelivered Mail") after:${afterSecs}`;
  const list = await gmail.users.messages.list({ userId: "me", q, maxResults: 50 });
  const hits: BounceHit[] = [];
  for (const msg of list.data.messages ?? []) {
    if (!msg.id) continue;
    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });
    const text = decodeGmailPayload(full.data.payload) + " " + (full.data.snippet ?? "");
    const hard = isHardBounce(text);
    for (const email of extractRecipients(text, integration.connectedEmail)) {
      hits.push({ email, hard, detail: (full.data.snippet ?? "").slice(0, 200) });
    }
  }
  return hits;
}

/** Recursively decode a Gmail message payload to text. */
function decodeGmailPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as {
    body?: { data?: string };
    parts?: unknown[];
    headers?: { name?: string; value?: string }[];
  };
  let out = "";
  const failedHeader = p.headers?.find(
    (h) => h.name?.toLowerCase() === "x-failed-recipients"
  );
  if (failedHeader?.value) out += "X-Failed-Recipients: " + failedHeader.value + "\n";
  if (p.body?.data) {
    out += Buffer.from(p.body.data, "base64").toString("utf8");
  }
  for (const part of p.parts ?? []) out += "\n" + decodeGmailPayload(part);
  return out;
}

/** Scan a Microsoft mailbox for bounce NDRs newer than `sinceMs`. */
async function scanGraph(
  integration: Integration,
  sinceMs: number
): Promise<BounceHit[]> {
  const token = await graphAccessTokenFor(integration);
  // Graph can't combine $search with $filter, so we $search for NDR subjects and
  // filter by received date on the client.
  const searchUrl =
    `https://graph.microsoft.com/v1.0/me/messages` +
    `?$search=${encodeURIComponent('"delivery has failed" OR "Undeliverable"')}` +
    `&$select=subject,bodyPreview,body,receivedDateTime&$top=50`;
  const res = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" },
  });
  if (!res.ok) throw new Error(`Graph message read failed (${res.status})`);
  const data = (await res.json()) as {
    value?: {
      subject?: string;
      bodyPreview?: string;
      body?: { content?: string };
      receivedDateTime?: string;
    }[];
  };
  const hits: BounceHit[] = [];
  for (const m of data.value ?? []) {
    if (m.receivedDateTime && new Date(m.receivedDateTime).getTime() < sinceMs) continue;
    const text = `${m.subject ?? ""}\n${m.body?.content ?? m.bodyPreview ?? ""}`;
    const hard = isHardBounce(text);
    for (const email of extractRecipients(text, integration.connectedEmail)) {
      hits.push({ email, hard, detail: (m.bodyPreview ?? "").slice(0, 200) });
    }
  }
  return hits;
}

/** Deduplicated bounce hits from a mailbox since `sinceMs`. */
export async function scanBounces(
  integration: Integration,
  sinceMs: number
): Promise<BounceHit[]> {
  const raw =
    integration.provider === "gmail"
      ? await scanGmail(integration, sinceMs)
      : await scanGraph(integration, sinceMs);
  // Dedupe by email, preferring a hard classification.
  const byEmail = new Map<string, BounceHit>();
  for (const h of raw) {
    const prev = byEmail.get(h.email);
    if (!prev || (h.hard && !prev.hard)) byEmail.set(h.email, h);
  }
  return [...byEmail.values()];
}
