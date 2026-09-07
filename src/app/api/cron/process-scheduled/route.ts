import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { sendCampaign } from "@/lib/email/sendCampaign";
import type { Campaign } from "@/lib/types";

// Dynamic: this is a scheduled job, never prerendered.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron target. Finds scheduled campaigns whose time has arrived and
 * sends them. Protected by CRON_SECRET so only Vercel Cron (or an authorized
 * caller) can trigger it.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const due = await adminDb
    .collectionGroup("campaigns")
    .where("status", "==", "scheduled")
    .where("scheduledAt", "<=", now)
    .limit(10) // process a few per tick to stay within the time budget
    .get();

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const doc of due.docs) {
    const campaign = doc.data() as Campaign;
    const orgId = doc.ref.parent.parent?.id;
    if (!orgId) continue;
    try {
      await sendCampaign(orgId, campaign.id);
      results.push({ id: campaign.id, ok: true });
    } catch (err) {
      // Mark failed so we don't retry a broken campaign forever.
      await doc.ref.update({ status: "failed", updatedAt: Date.now() });
      results.push({ id: campaign.id, ok: false, error: String(err).slice(0, 200) });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
