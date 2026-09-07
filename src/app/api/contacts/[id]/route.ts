import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  firstName: z.string().max(120).optional(),
  lastName: z.string().max(120).optional(),
  practiceName: z.string().max(200).optional(),
  specialty: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  subscribed: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { orgId } = await requireOrg();
    const body = patchSchema.parse(await req.json());
    const ref = adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("contacts")
      .doc(params.id);
    if (!(await ref.get()).exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await ref.set(
      JSON.parse(JSON.stringify({ ...body, updatedAt: Date.now() })),
      { merge: true }
    );
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
      .collection("contacts")
      .doc(params.id)
      .delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
