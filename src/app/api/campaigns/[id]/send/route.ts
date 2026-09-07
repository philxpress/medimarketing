import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import { getCampaign, getContactsByIds, getIntegrationRaw, getList, logEvent } from "@/lib/data";
import { compileTemplate, contactToMergeContext } from "@/lib/email/merge";
import {
  withComplianceFooter,
  unsubscribeUrl,
  oneClickUnsubscribeUrl,
} from "@/lib/email/compliance";
import { sendEmail } from "@/lib/email/providers";
import type { Campaign, Recipient } from "@/lib/types";
// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

// Max serverless execution time. 60s is the ceiling on Vercel's Hobby plan;
// Pro/Enterprise allow up to 300 (raise this if you upgrade). For large lists,
// move sending to a background queue (see README roadmap) rather than raising this.
export const maxDuration = 60;

/**
 * Send a campaign to its list. Renders merge fields per recipient, appends the
 * required compliance footer + unsubscribe link, and dispatches through the
 * connected mailbox. Skips anyone who has unsubscribed.
 *
 * NOTE: for large lists this should be moved to a background queue/cron. This
 * synchronous version is intended for MVP-scale batches.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { orgId, org, user } = await requireOrg();
    const campaign = await getCampaign(orgId, params.id);
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (campaign.status === "sending" || campaign.status === "sent") {
      return NextResponse.json({ error: `Campaign already ${campaign.status}` }, { status: 409 });
    }
    if (!org.postalAddress) {
      return NextResponse.json(
        { error: "Add your postal address in Settings before sending." },
        { status: 400 }
      );
    }
    const integration = await getIntegrationRaw(orgId, campaign.fromProvider);
    if (!integration || integration.status !== "connected") {
      return NextResponse.json(
        { error: `No connected ${campaign.fromProvider} mailbox.` },
        { status: 400 }
      );
    }
    if (!campaign.listId) {
      return NextResponse.json({ error: "Campaign has no recipient list." }, { status: 400 });
    }

    const list = await getList(orgId, campaign.listId);
    const contacts = await getContactsByIds(orgId, list?.contactIds ?? []);

    const campaignRef = adminDb.collection("orgs").doc(orgId).collection("campaigns").doc(campaign.id);
    await campaignRef.update({ status: "sending", startedAt: Date.now(), updatedAt: Date.now() });

    const subjectTpl = compileTemplate(campaign.subject);
    const bodyTpl = compileTemplate(campaign.body);
    const fromName = org.name;

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const contact of contacts) {
      const recipientRef = campaignRef.collection("recipients").doc(contact.id);

      if (!contact.subscribed) {
        skipped++;
        await recipientRef.set({
          id: contact.id,
          email: contact.email,
          status: "skipped",
          error: "unsubscribed",
        } satisfies Recipient);
        continue;
      }

      try {
        const ctx = contactToMergeContext(contact);
        const subject = subjectTpl(ctx);
        const renderedBody = bodyTpl(ctx);
        const html = withComplianceFooter(
          renderedBody,
          org,
          unsubscribeUrl(orgId, contact.id)
        );

        const result = await sendEmail(campaign.fromProvider, integration, {
          fromName,
          fromEmail: integration.connectedEmail,
          to: contact.email,
          subject,
          html,
          unsubscribeUrl: oneClickUnsubscribeUrl(orgId, contact.id),
          replyTo: org.replyToEmail,
        });

        sent++;
        await recipientRef.set({
          id: contact.id,
          email: contact.email,
          status: "sent",
          providerMessageId: result.messageId,
          sentAt: Date.now(),
        } satisfies Recipient);
      } catch (err) {
        failed++;
        await recipientRef.set({
          id: contact.id,
          email: contact.email,
          status: "failed",
          error: String(err).slice(0, 300),
        } satisfies Recipient);
      }

      // Gentle pacing to stay within mailbox rate limits.
      await sleep(120);
    }

    const finalStats: Campaign["stats"] = { total: contacts.length, sent, failed, skipped };
    await campaignRef.update({
      status: failed > 0 && sent === 0 ? "failed" : "sent",
      stats: finalStats,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await logEvent(orgId, {
      type: "campaign.sent",
      actorUid: user.uid,
      summary: `Sent "${campaign.name}" — ${sent} delivered, ${failed} failed, ${skipped} skipped`,
      meta: finalStats,
    });

    return NextResponse.json({ ok: true, stats: finalStats });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
