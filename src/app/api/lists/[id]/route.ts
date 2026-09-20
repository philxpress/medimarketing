import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import type { ContactList } from "@/lib/types";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  addContactIds: z.array(z.string().min(1)).max(50000).optional(),
  removeContactIds: z.array(z.string().min(1)).max(50000).optional(),
});

/** Rename a list and/or add/remove members. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { orgId } = await requireOrg();
    const b = patchSchema.parse(await req.json());
    const ref = adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("lists")
      .doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const list = snap.data() as ContactList;
    let contactIds = list.contactIds ?? [];
    if (b.addContactIds?.length) {
      contactIds = [...new Set([...contactIds, ...b.addContactIds])];
    }
    if (b.removeContactIds?.length) {
      const remove = new Set(b.removeContactIds);
      contactIds = contactIds.filter((id) => !remove.has(id));
    }

    const update: Record<string, unknown> = { updatedAt: Date.now() };
    if (b.name) update.name = b.name.trim();
    if (b.addContactIds?.length || b.removeContactIds?.length) {
      update.contactIds = contactIds;
    }
    await ref.set(update, { merge: true });
    return NextResponse.json({ ok: true, count: contactIds.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

/** Delete a list. Contacts themselves are untouched. */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { orgId } = await requireOrg();
    await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("lists")
      .doc(params.id)
      .delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
