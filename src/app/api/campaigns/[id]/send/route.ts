import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/session";
import { getCampaign } from "@/lib/data";
import { startCampaignSend } from "@/lib/email/sendCampaign";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";
// 60s is the Vercel Hobby ceiling. We seed the queue and send the first batch
// here; the process-sending cron drains the rest, so list size is unbounded.
export const maxDuration = 60;

/** Kick off a campaign send: seed the recipient queue and send the first batch. */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { orgId, user } = await requireOrg();
    const campaign = await getCampaign(orgId, params.id);
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (campaign.status === "sending" || campaign.status === "sent") {
      return NextResponse.json(
        { error: `Campaign already ${campaign.status}` },
        { status: 409 }
      );
    }
    const result = await startCampaignSend(orgId, params.id, user.uid);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
