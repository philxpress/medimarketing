import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import { verifyEmails } from "@/lib/email/verify";
import { suppressedSubset } from "@/lib/email/suppression";
import { planFor } from "@/lib/plans";
import type { Contact } from "@/lib/types";
// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KNOWN = new Set([
  "email",
  "firstname",
  "first name",
  "lastname",
  "last name",
  "practice",
  "practicename",
  "practice name",
  "specialty",
  "speciality",
  "city",
]);

/**
 * Accepts a CSV (raw text) plus an optional list name. Rows are upserted by
 * email; unknown columns become custom merge fields. Returns import stats.
 */
export async function POST(req: NextRequest) {
  try {
    const { orgId, org } = await requireOrg();
    const { csv, listName } = (await req.json()) as {
      csv: string;
      listName?: string;
    };
    if (!csv?.trim()) {
      return NextResponse.json({ error: "Empty CSV" }, { status: 400 });
    }

    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    const now = Date.now();
    const contactsCol = adminDb.collection("orgs").doc(orgId).collection("contacts");

    // Verify all candidate emails up front (syntax + disposable + MX), and load
    // the suppression list so we never re-import a bounced/complained address.
    const candidateEmails = parsed.data
      .map((row) => (row.email || row.Email || row.EMAIL || "").trim().toLowerCase())
      .filter(Boolean);
    const [verdicts, suppressed] = await Promise.all([
      verifyEmails(candidateEmails),
      suppressedSubset(orgId, candidateEmails),
    ]);

    // Plan cap: don't let an import push the org over its contact limit.
    const plan = planFor(org.plan);
    const existingCount = (await contactsCol.count().get()).data().count;
    let capacity = Math.max(0, plan.maxContacts - existingCount);

    let imported = 0;
    let skipped = 0;
    const rejects = { syntax: 0, disposable: 0, "no-mx": 0, suppressed: 0, capped: 0 };
    const seen = new Set<string>();
    const importedIds: string[] = [];

    // Batch writes in chunks of 400 (Firestore limit is 500 ops/batch).
    let batch = adminDb.batch();
    let ops = 0;

    for (const row of parsed.data) {
      const email = (row.email || row.Email || row.EMAIL || "").trim().toLowerCase();
      const verdict = verdicts.get(email);
      if (!email || !verdict || !verdict.valid) {
        skipped++;
        if (verdict?.reason) rejects[verdict.reason]++;
        else rejects.syntax++;
        continue;
      }
      if (suppressed.has(email)) {
        skipped++;
        rejects.suppressed++;
        continue;
      }
      // A new (not previously seen this import, not already stored) contact
      // consumes plan capacity. Re-imports of existing contacts still upsert.
      if (!seen.has(email) && capacity <= 0) {
        skipped++;
        rejects.capped++;
        continue;
      }
      if (!seen.has(email)) {
        seen.add(email);
        capacity--;
      }
      const custom: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        if (!KNOWN.has(key.toLowerCase()) && value?.trim()) {
          custom[key] = value.trim();
        }
      }
      // Deterministic id from email → idempotent re-imports (upsert).
      const id = Buffer.from(email).toString("base64url").slice(0, 40);
      const contact: Contact = {
        id,
        email,
        firstName: pick(row, "firstname", "first name"),
        lastName: pick(row, "lastname", "last name"),
        practiceName: pick(row, "practice", "practicename", "practice name"),
        specialty: pick(row, "specialty", "speciality"),
        city: pick(row, "city"),
        tags: [],
        custom,
        subscribed: true,
        source: "upload",
        createdAt: now,
        updatedAt: now,
      };
      batch.set(contactsCol.doc(id), contact, { merge: true });
      importedIds.push(id);
      imported++;
      if (++ops >= 400) {
        await batch.commit();
        batch = adminDb.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();

    // Optionally group everything imported into a named list.
    let listId: string | undefined;
    if (listName?.trim() && importedIds.length) {
      const listRef = adminDb
        .collection("orgs")
        .doc(orgId)
        .collection("lists")
        .doc();
      await listRef.set({
        id: listRef.id,
        name: listName.trim(),
        contactIds: importedIds,
        createdAt: now,
        updatedAt: now,
      });
      listId = listRef.id;
    }

    await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("events")
      .add({
        type: "contact.imported",
        summary: `Imported ${imported} contacts${listName ? ` into "${listName}"` : ""}`,
        createdAt: now,
        meta: { imported, skipped, rejects },
      });

    return NextResponse.json({
      imported,
      skipped,
      rejects,
      listId,
      errors: parsed.errors.slice(0, 5),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

function pick(row: Record<string, string>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    for (const actual of Object.keys(row)) {
      if (actual.toLowerCase() === k) {
        const v = row[actual]?.trim();
        if (v) return v;
      }
    }
  }
  return undefined;
}
