import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { orgId } = await requireOrg();
    await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("templates")
      .doc(params.id)
      .delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
