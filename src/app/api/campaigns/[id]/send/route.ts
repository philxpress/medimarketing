import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/session";
import { getCampaign } from "@/lib/data";
import { sendCampaign } from "@/lib/email/sendCampaign";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";
// 60s is the Vercel Hobby ceiling; large lists should use scheduled/queued sends.
export const maxDuration = 60;

/** Send a campaign immediately to its list. */
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
    const { stats } = await sendCampaign(orgId, params.id, user.uid);
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
