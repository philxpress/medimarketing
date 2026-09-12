/**
 * Server-side data access for the platform-admin console.
 * These span all orgs and the shared prospect database, so only ever call them
 * behind requirePlatformAdmin() / getPlatformAdmin().
 *
 * Reads are deliberately frugal: the Database page shows the total from a single
 * `meta/clinics` doc (written at import time) and only queries the big `clinics`
 * collection when the operator actually searches.
 */
import "server-only";
import { geohashQueryBounds, distanceBetween } from "geofire-common";
import { adminDb } from "@/lib/firebase/admin";
import type { Clinic, Org } from "@/lib/types";
import pcData from "@/lib/data/postcodes.json";

const POSTCODES = pcData as unknown as {
  byPostcode: Record<string, [number, number]>;
  bySuburb: Record<string, string>;
};

/** Every company (org), newest first. */
export async function getAllOrgs(): Promise<Org[]> {
  const snap = await adminDb.collection("orgs").orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => d.data() as Org);
}

export async function getOrg(orgId: string): Promise<Org | null> {
  const snap = await adminDb.collection("orgs").doc(orgId).get();
  return snap.exists ? (snap.data() as Org) : null;
}

/** Total clinics from the stored counter — a single doc read, no scan. */
export async function getClinicMeta(): Promise<{ count: number; updatedAt: number } | null> {
  const snap = await adminDb.collection("meta").doc("clinics").get();
  if (!snap.exists) return null;
  const d = snap.data() as { count?: number; updatedAt?: number };
  return { count: d.count ?? 0, updatedAt: d.updatedAt ?? 0 };
}

/** Resolve a postcode or suburb to a map centre using the bundled lookup. */
export function resolveCenter(
  location: string
): { center: [number, number]; postcode: string; label: string } | null {
  const raw = location.trim();
  if (!raw) return null;
  if (/^\d{3,4}$/.test(raw)) {
    const c = POSTCODES.byPostcode[raw];
    return c ? { center: c, postcode: raw, label: raw } : null;
  }
  const sub = raw.toLowerCase().replace(/\s+/g, " ");
  const pc = POSTCODES.bySuburb[sub];
  const c = pc ? POSTCODES.byPostcode[pc] : undefined;
  return c ? { center: c, postcode: pc, label: `${raw} (${pc})` } : null;
}

export interface ClinicSearch {
  name?: string;
  phone?: string;
  email?: string;
  location?: string; // postcode or suburb
  radiusKm?: number;
}

export interface ClinicResult extends Clinic {
  distanceKm?: number;
}

export interface ClinicSearchOutcome {
  clinics: ClinicResult[];
  mode: "radius" | "text";
  center?: { postcode: string; label: string };
  locationError?: string;
  truncated: boolean;
}

const RESULT_CAP = 200;
// High private-use code point → upper bound for a "starts-with" prefix query.
const PREFIX_END = String.fromCharCode(0xf8ff);

function textMatch(c: Clinic, s: ClinicSearch): boolean {
  const has = (v: string, q?: string) =>
    !q || v.toLowerCase().includes(q.trim().toLowerCase());
  return has(c.name, s.name) && has(c.phone, s.phone) && has(c.email, s.email);
}

/**
 * Search clinics on demand. With a location + radius it runs a geohash range
 * query around that postcode/suburb centre; otherwise a prefix query on the
 * first provided text field, filtering the rest in memory.
 */
export async function searchClinics(s: ClinicSearch): Promise<ClinicSearchOutcome> {
  const col = adminDb.collection("clinics");

  // ── Radius mode ──────────────────────────────────────────────────────
  if (s.location && s.radiusKm) {
    const resolved = resolveCenter(s.location);
    if (!resolved) {
      return {
        clinics: [],
        mode: "radius",
        truncated: false,
        locationError: `Couldn't find "${s.location}". Try a 4-digit postcode.`,
      };
    }
    const radiusM = s.radiusKm * 1000;
    const bounds = geohashQueryBounds(resolved.center, radiusM);
    const snaps = await Promise.all(
      bounds.map((b) =>
        col.orderBy("geohash").startAt(b[0]).endAt(b[1]).limit(400).get()
      )
    );
    const seen = new Set<string>();
    let results: ClinicResult[] = [];
    for (const snap of snaps) {
      for (const doc of snap.docs) {
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);
        const c = doc.data() as Clinic;
        if (c.lat == null || c.lng == null) continue;
        const distanceKm = distanceBetween([c.lat, c.lng], resolved.center);
        if (distanceKm > s.radiusKm) continue;
        if (!textMatch(c, s)) continue;
        results.push({ ...c, distanceKm });
      }
    }
    results.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    const truncated = results.length > RESULT_CAP;
    return {
      clinics: results.slice(0, RESULT_CAP),
      mode: "radius",
      center: { postcode: resolved.postcode, label: resolved.label },
      truncated,
    };
  }

  // ── Text mode ────────────────────────────────────────────────────────
  // Pick the first provided field as the indexed prefix query; filter the rest.
  const primary: { field: keyof Clinic; q: string } | null = s.name?.trim()
    ? { field: "name", q: s.name.trim() }
    : s.phone?.trim()
      ? { field: "phone", q: s.phone.trim() }
      : s.email?.trim()
        ? { field: "email", q: s.email.trim() }
        : null;
  if (!primary) return { clinics: [], mode: "text", truncated: false };

  const snap = await col
    .orderBy(primary.field)
    .startAt(primary.q)
    .endAt(primary.q + PREFIX_END)
    .limit(RESULT_CAP + 1)
    .get();
  let results = snap.docs.map((d) => d.data() as ClinicResult).filter((c) => textMatch(c, s));
  const truncated = results.length > RESULT_CAP;
  return { clinics: results.slice(0, RESULT_CAP), mode: "text", truncated };
}
