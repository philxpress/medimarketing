import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import { getCampaign } from "@/lib/data";
import type { Campaign } from "@/lib/types";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

/** Create a fresh draft copy of an existing campaign. */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { orgId, user } = await requireOrg();
    const source = await getCampaign(orgId, params.id);
    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const ref = adminDb.collection("orgs").doc(orgId).collection("campaigns").doc();
    const now = Date.now();
    const copy: Campaign = {
      ...source,
      id: ref.id,
      name: `${source.name} (copy)`,
      status: "draft",
      scheduledAt: undefined,
      stats: {
        total: source.stats.total,
        sent: 0,
        failed: 0,
        skipped: 0,
        opened: 0,
        clicked: 0,
      },
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
      startedAt: undefined,
      completedAt: undefined,
    };
    // Firestore rejects undefined values — strip them.
    const clean = JSON.parse(JSON.stringify(copy));
    await ref.set(clean);
    return NextResponse.json({ id: ref.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
