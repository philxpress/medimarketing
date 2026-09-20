/**
 * Org-scoped suppression list. Any address here is never emailed again,
 * regardless of which list/campaign it appears in. Populated by hard bounces,
 * spam complaints, and manual adds.
 *
 *   orgs/{orgId}/suppressions/{key}   key = base64url(lowercased email)
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { Suppression } from "@/lib/types";

export function suppressionKey(email: string): string {
  return Buffer.from(email.trim().toLowerCase()).toString("base64url");
}

function col(orgId: string) {
  return adminDb.collection("orgs").doc(orgId).collection("suppressions");
}

export async function addSuppression(
  orgId: string,
  email: string,
  reason: Suppression["reason"],
  detail?: string
): Promise<void> {
  const clean = email.trim().toLowerCase();
  if (!clean) return;
  const id = suppressionKey(clean);
  const doc: Suppression = {
    id,
    email: clean,
    reason,
    ...(detail ? { detail: detail.slice(0, 300) } : {}),
    createdAt: Date.now(),
  };
  // merge:false-ish — keep the earliest reason but refresh detail.
  await col(orgId).doc(id).set(doc, { merge: true });
}

/** Return the subset of the given emails that are suppressed. */
export async function suppressedSubset(
  orgId: string,
  emails: string[]
): Promise<Set<string>> {
  const found = new Set<string>();
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    const ids = chunk.map(suppressionKey);
    const snap = await col(orgId).where("__name__", "in", ids).get();
    snap.docs.forEach((d) => found.add((d.data() as Suppression).email));
  }
  return found;
}

export async function listSuppressions(
  orgId: string,
  limit = 500
): Promise<Suppression[]> {
  const snap = await col(orgId).orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => d.data() as Suppression);
}

export async function countSuppressions(orgId: string): Promise<number> {
  const snap = await col(orgId).count().get();
  return snap.data().count;
}

export async function removeSuppression(orgId: string, email: string): Promise<void> {
  await col(orgId).doc(suppressionKey(email)).delete();
}
