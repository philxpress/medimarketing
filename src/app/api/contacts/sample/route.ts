import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import { SAMPLE_CONTACTS } from "@/lib/sampleData";
import type { Contact } from "@/lib/types";

/** Seeds the provided demo medical B2B list into the org. */
export async function POST() {
  try {
    const { orgId } = await requireOrg();
    const now = Date.now();
    const contactsCol = adminDb.collection("orgs").doc(orgId).collection("contacts");
    const batch = adminDb.batch();
    const ids: string[] = [];

    for (const s of SAMPLE_CONTACTS) {
      const id = Buffer.from(s.email).toString("base64url").slice(0, 40);
      const contact: Contact = {
        ...s,
        id,
        tags: ["sample"],
        custom: {},
        subscribed: true,
        source: "provided",
        createdAt: now,
        updatedAt: now,
      };
      batch.set(contactsCol.doc(id), contact, { merge: true });
      ids.push(id);
    }

    const listRef = adminDb.collection("orgs").doc(orgId).collection("lists").doc();
    batch.set(listRef, {
      id: listRef.id,
      name: "Sample medical practices",
      description: "Provided demo list of fictional clinics.",
      contactIds: ids,
      createdAt: now,
      updatedAt: now,
    });

    await batch.commit();
    return NextResponse.json({ imported: ids.length, listId: listRef.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
