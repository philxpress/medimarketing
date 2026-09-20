import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import type { ContactList } from "@/lib/types";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(1).max(120),
  contactIds: z.array(z.string().min(1)).max(50000).optional(),
});

/** Create a contact list, optionally seeded with a set of contacts. */
export async function POST(req: NextRequest) {
  try {
    const { orgId } = await requireOrg();
    const b = schema.parse(await req.json());
    const now = Date.now();
    const ref = adminDb.collection("orgs").doc(orgId).collection("lists").doc();
    const list: ContactList = {
      id: ref.id,
      name: b.name.trim(),
      contactIds: [...new Set(b.contactIds ?? [])],
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(list);
    return NextResponse.json(list);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
