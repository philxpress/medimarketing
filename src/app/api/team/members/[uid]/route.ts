import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import type { Member } from "@/lib/types";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

const patchSchema = z.object({ role: z.enum(["admin", "member"]) });

function membersCol(orgId: string) {
  return adminDb.collection("orgs").doc(orgId).collection("members");
}

/** Change a member's role. Owners and admins only; the owner can't be demoted. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { uid: string } }
) {
  try {
    const { orgId, member } = await requireOrg();
    if (member.role === "member") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    const body = patchSchema.parse(await req.json());
    const target = (await membersCol(orgId).doc(params.uid).get()).data() as Member | undefined;
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (target.role === "owner") {
      return NextResponse.json({ error: "The owner's role can't be changed." }, { status: 400 });
    }
    await membersCol(orgId).doc(params.uid).set({ role: body.role }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

/** Remove a member from the org. Owners and admins only; the owner can't be removed. */
export async function DELETE(
  _req: Request,
  { params }: { params: { uid: string } }
) {
  try {
    const { orgId, member } = await requireOrg();
    if (member.role === "member") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    const target = (await membersCol(orgId).doc(params.uid).get()).data() as Member | undefined;
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (target.role === "owner") {
      return NextResponse.json({ error: "The owner can't be removed." }, { status: 400 });
    }
    const batch = adminDb.batch();
    batch.delete(membersCol(orgId).doc(params.uid));
    batch.delete(adminDb.collection("userIndex").doc(params.uid));
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
