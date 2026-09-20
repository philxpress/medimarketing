import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { drainCampaign } from "@/lib/email/sendCampaign";
import type { Campaign } from "@/lib/types";

// Dynamic: scheduled job, never prerendered.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Resume cron. Finds campaigns still in "sending" — ones whose in-request drain
 * ran out of time budget or hit a daily quota ceiling — and keeps sending. Safe
 * to run frequently; each campaign resumes exactly where its queue left off.
 * Protected by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sending = await adminDb
    .collectionGroup("campaigns")
    .where("status", "==", "sending")
    .limit(20)
    .get();

  const deadline = Date.now() + 50_000; // shared time budget across campaigns
  const results: { id: string; sent: number; done: boolean }[] = [];
  for (const doc of sending.docs) {
    if (Date.now() >= deadline) break;
    const campaign = doc.data() as Campaign;
    const orgId = doc.ref.parent.parent?.id;
    if (!orgId) continue;
    try {
      const budget = Math.max(5_000, deadline - Date.now());
      const r = await drainCampaign(orgId, campaign.id, budget);
      results.push({ id: campaign.id, sent: r.processed, done: r.done });
    } catch (err) {
      results.push({ id: campaign.id, sent: 0, done: false });
      await doc.ref.update({
        lastError: String(err).slice(0, 200),
        updatedAt: Date.now(),
      });
    }
  }

  return NextResponse.json({ resumed: results.length, results });
}
