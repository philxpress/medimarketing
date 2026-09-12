import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

const schema = z.object({ displayName: z.string().min(1).max(120) });

/** Update the signed-in member's own display name. */
export async function POST(req: NextRequest) {
  try {
    const { orgId, user } = await requireOrg();
    const body = schema.parse(await req.json());
    await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("members")
      .doc(user.uid)
      .set({ displayName: body.displayName }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
