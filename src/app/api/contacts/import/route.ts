import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import type { Contact } from "@/lib/types";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Accepts a CSV (raw text) plus an optional list name. Rows are upserted by
 * email; unknown columns become custom merge fields. Returns import stats.
 */
export async function POST(req: NextRequest) {
  try {
    const { orgId } = await requireOrg();
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
    let imported = 0;
    let skipped = 0;
    const importedIds: string[] = [];

    // Batch writes in chunks of 400 (Firestore limit is 500 ops/batch).
    let batch = adminDb.batch();
    let ops = 0;

    for (const row of parsed.data) {
      const email = (row.email || row.Email || row.EMAIL || "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        skipped++;
        continue;
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
        meta: { imported, skipped },
      });

    return NextResponse.json({ imported, skipped, listId, errors: parsed.errors.slice(0, 5) });
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
