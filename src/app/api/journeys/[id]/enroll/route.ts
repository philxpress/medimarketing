import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import { getJourney, getList, getContactsByIds } from "@/lib/data";
import type { Enrollment } from "@/lib/types";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

const schema = z.object({
  listId: z.string(),
  segment: z
    .object({
      specialty: z.string().optional(),
      city: z.string().optional(),
      tag: z.string().optional(),
    })
    .optional(),
});

/** Enroll a list (optionally segmented) of subscribed contacts into a journey. */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { orgId } = await requireOrg();
    const b = schema.parse(await req.json());
    const journey = await getJourney(orgId, params.id);
    if (!journey) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!journey.steps.length) {
      return NextResponse.json({ error: "Journey has no steps" }, { status: 400 });
    }

    const list = await getList(orgId, b.listId);
    const contacts = (await getContactsByIds(orgId, list?.contactIds ?? [])).filter((c) => {
      if (!c.subscribed) return false;
      const seg = b.segment;
      if (seg?.specialty && (c.specialty ?? "") !== seg.specialty) return false;
      if (seg?.city && (c.city ?? "") !== seg.city) return false;
      if (seg?.tag && !(c.tags ?? []).includes(seg.tag)) return false;
      return true;
    });

    const journeyRef = adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("journeys")
      .doc(params.id);
    const now = Date.now();
    const firstDelayMs = journey.steps[0].delayHours * 3600_000;

    let enrolled = 0;
    let batch = adminDb.batch();
    let ops = 0;
    for (const c of contacts) {
      const enrRef = journeyRef.collection("enrollments").doc(c.id);
      // Skip anyone already enrolled (don't restart their sequence).
      // (A single get per contact keeps this simple for MVP-scale lists.)
      const existing = await enrRef.get();
      if (existing.exists && existing.data()?.status === "active") continue;

      const enrollment: Enrollment = {
        id: c.id,
        contactId: c.id,
        email: c.email,
        currentStep: 0,
        nextRunAt: now + firstDelayMs,
        status: "active",
        startedAt: now,
        updatedAt: now,
      };
      batch.set(enrRef, enrollment);
      enrolled++;
      if (++ops >= 400) {
        await batch.commit();
        batch = adminDb.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();

    await journeyRef.set(
      { enrolledCount: FieldValue.increment(enrolled), updatedAt: now },
      { merge: true }
    );

    return NextResponse.json({ enrolled });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
