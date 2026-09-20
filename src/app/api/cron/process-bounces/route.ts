import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { scanBounces } from "@/lib/email/bounces";
import { addSuppression } from "@/lib/email/suppression";
import { getCampaigns, logEvent } from "@/lib/data";
import type { Integration } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000; // scan up to 3 days back on first run
const MATCH_WINDOW_MS = 21 * 24 * 60 * 60 * 1000; // match bounces to sends ≤3wk old

/**
 * Bounce cron. For every mailbox that granted read scope, scan recent NDRs,
 * suppress hard-bounced addresses, and mark the matching recipient rows
 * "bounced" (bumping the campaign's bounced count). Protected by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgs = await adminDb.collection("orgs").get();
  const summary: { orgId: string; provider: string; hard: number }[] = [];

  for (const orgDoc of orgs.docs) {
    const orgId = orgDoc.id;
    const integs = await orgDoc.ref.collection("integrations").get();
    for (const iDoc of integs.docs) {
      const integration = iDoc.data() as Integration;
      if (integration.status !== "connected" || !integration.canReadMailbox) continue;

      const since = integration.bounceScanAt ?? Date.now() - LOOKBACK_MS;
      let hits;
      try {
        hits = await scanBounces(integration, since);
      } catch {
        continue; // read may fail if the token lost read scope — skip quietly
      }
      await iDoc.ref.set({ bounceScanAt: Date.now() }, { merge: true });

      const hard = hits.filter((h) => h.hard);
      if (hard.length === 0) continue;

      // Suppress every hard-bounced address so it's never emailed again.
      await Promise.all(
        hard.map((h) => addSuppression(orgId, h.email, "bounce", h.detail))
      );

      // Mark matching recipient rows across recently-sent campaigns.
      const hardEmails = new Set(hard.map((h) => h.email));
      const recentCampaigns = (await getCampaigns(orgId)).filter(
        (c) =>
          (c.status === "sent" || c.status === "failed") &&
          (c.completedAt ?? c.createdAt) >= Date.now() - MATCH_WINDOW_MS
      );
      for (const campaign of recentCampaigns) {
        const recCol = orgDoc.ref
          .collection("campaigns")
          .doc(campaign.id)
          .collection("recipients");
        const emailList = [...hardEmails];
        let bounced = 0;
        for (let i = 0; i < emailList.length; i += 30) {
          const chunk = emailList.slice(i, i + 30);
          const snap = await recCol.where("email", "in", chunk).get();
          for (const r of snap.docs) {
            const data = r.data();
            if (data.status === "sent" && !data.bouncedAt) {
              await r.ref.set(
                {
                  status: "bounced",
                  bouncedAt: Date.now(),
                  bounceReason: "hard bounce",
                },
                { merge: true }
              );
              bounced++;
            }
          }
        }
        if (bounced > 0) {
          await orgDoc.ref
            .collection("campaigns")
            .doc(campaign.id)
            .set({ stats: { bounced: FieldValue.increment(bounced) } }, { merge: true });
        }
      }

      await logEvent(orgId, {
        type: "campaign.bounces_detected",
        summary: `Detected ${hard.length} hard bounce${hard.length === 1 ? "" : "s"} on ${integration.connectedEmail}`,
        meta: { count: hard.length },
      });
      summary.push({ orgId, provider: integration.provider, hard: hard.length });
    }
  }

  return NextResponse.json({ scanned: summary.length, summary });
}
