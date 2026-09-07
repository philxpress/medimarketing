import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import type { Invite } from "@/lib/types";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

/** Revoke a pending invite (by its key). Owners and admins only. */
export async function DELETE(
  _req: Request,
  { params }: { params: { key: string } }
) {
  try {
    const { orgId, member } = await requireOrg();
    if (member.role === "member") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    const ref = adminDb.collection("invites").doc(params.key);
    const invite = (await ref.get()).data() as Invite | undefined;
    // Only allow revoking invites that belong to this org.
    if (!invite || invite.orgId !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
