import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

const patchSchema = z.object({ active: z.boolean().optional() });

/** Activate / pause a journey. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { orgId } = await requireOrg();
    const body = patchSchema.parse(await req.json());
    await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("journeys")
      .doc(params.id)
      .set({ ...body, updatedAt: Date.now() }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { orgId } = await requireOrg();
    await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("journeys")
      .doc(params.id)
      .delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
