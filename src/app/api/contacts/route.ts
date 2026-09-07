import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import type { Contact } from "@/lib/types";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
  firstName: z.string().max(120).optional(),
  lastName: z.string().max(120).optional(),
  practiceName: z.string().max(200).optional(),
  specialty: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

/** Create (or upsert) a single contact manually. */
export async function POST(req: NextRequest) {
  try {
    const { orgId } = await requireOrg();
    const b = schema.parse(await req.json());
    const email = b.email.trim().toLowerCase();
    const id = Buffer.from(email).toString("base64url").slice(0, 40);
    const now = Date.now();
    const ref = adminDb.collection("orgs").doc(orgId).collection("contacts").doc(id);
    const existing = await ref.get();

    const contact: Contact = {
      id,
      email,
      firstName: b.firstName,
      lastName: b.lastName,
      practiceName: b.practiceName,
      specialty: b.specialty,
      city: b.city,
      tags: b.tags ?? [],
      custom: (existing.data()?.custom as Record<string, string>) ?? {},
      subscribed: (existing.data()?.subscribed as boolean) ?? true,
      source: existing.exists ? (existing.data()!.source as Contact["source"]) : "manual",
      createdAt: (existing.data()?.createdAt as number) ?? now,
      updatedAt: now,
    };
    // Firestore rejects undefined; strip them.
    await ref.set(JSON.parse(JSON.stringify(contact)), { merge: true });
    return NextResponse.json({ id, created: !existing.exists });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
