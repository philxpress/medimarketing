/**
 * Server-side data access for the platform-admin console.
 * These functions span all orgs and the shared prospect database, so they must
 * only ever be called behind requirePlatformAdmin() / getPlatformAdmin().
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { Clinic, Org } from "@/lib/types";

/** Every company (org), newest first. */
export async function getAllOrgs(): Promise<Org[]> {
  const snap = await adminDb.collection("orgs").orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => d.data() as Org);
}

export async function getOrg(orgId: string): Promise<Org | null> {
  const snap = await adminDb.collection("orgs").doc(orgId).get();
  return snap.exists ? (snap.data() as Org) : null;
}

/** Total clinics in the shared database (aggregation query — cheap). */
export async function countClinics(): Promise<number> {
  const agg = await adminDb.collection("clinics").count().get();
  return agg.data().count;
}

export interface ClinicQuery {
  state?: string;
  q?: string;
  after?: string; // cursor: last clinic name from the previous page
  limit?: number;
}

/**
 * Paginated clinic browse. Filters by state and/or a case-sensitive name
 * prefix, ordered by name. Returns one extra row internally to compute the
 * next cursor. Requires the composite index (state, name); see
 * firestore.indexes.json.
 */
export async function queryClinics(
  opts: ClinicQuery
): Promise<{ clinics: Clinic[]; nextCursor: string | null }> {
  const limit = opts.limit ?? 25;
  let ref = adminDb.collection("clinics") as FirebaseFirestore.Query;
  if (opts.state) ref = ref.where("state", "==", opts.state);
  if (opts.q) {
    ref = ref.where("name", ">=", opts.q).where("name", "<=", opts.q + "");
  }
  ref = ref.orderBy("name").limit(limit + 1);
  if (opts.after) ref = ref.startAfter(opts.after);

  const snap = await ref.get();
  const clinics = snap.docs.map((d) => d.data() as Clinic);
  let nextCursor: string | null = null;
  if (clinics.length > limit) {
    clinics.pop();
    nextCursor = clinics[clinics.length - 1]?.name ?? null;
  }
  return { clinics, nextCursor };
}
