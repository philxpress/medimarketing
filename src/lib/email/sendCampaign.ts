/**
 * Core campaign-send pipeline, shared by the manual send route, the scheduled
 * cron, and test sends. Renders merge fields per recipient, appends the
 * compliance footer + unsubscribe link, attaches files, and dispatches through
 * the connected mailbox. Unsubscribed contacts are skipped.
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import {
  getCampaign,
  getContactsByIds,
  getIntegrationRaw,
  getList,
  logEvent,
} from "@/lib/data";
import { compileTemplate, contactToMergeContext } from "@/lib/email/merge";
import {
  withComplianceFooter,
  unsubscribeUrl,
  oneClickUnsubscribeUrl,
} from "@/lib/email/compliance";
import { sendEmail } from "@/lib/email/providers";
import type { MimeAttachment } from "@/lib/email/mime";
import { fetchAsBase64 } from "@/lib/storage";
import type { Campaign, Recipient } from "@/lib/types";

export interface SendOutcome {
  stats: Campaign["stats"];
}

/** Fetch every attachment's bytes once (reused across all recipients). */
async function prepareAttachments(campaign: Campaign): Promise<MimeAttachment[]> {
  if (!campaign.attachments?.length) return [];
  return Promise.all(
    campaign.attachments.map(async (att) => ({
      filename: att.filename,
      contentType: att.contentType,
      contentBase64: await fetchAsBase64(att.url),
    }))
  );
}

export async function sendCampaign(
  orgId: string,
  campaignId: string,
  actorUid?: string
): Promise<SendOutcome> {
  const campaign = await getCampaign(orgId, campaignId);
  if (!campaign) throw new Error("Campaign not found");

  const orgSnap = await adminDb.collection("orgs").doc(orgId).get();
  const org = orgSnap.data() as import("@/lib/types").Org;
  if (!org?.postalAddress) {
    throw new Error("Add your postal address in Settings before sending.");
  }
  const integration = await getIntegrationRaw(orgId, campaign.fromProvider);
  if (!integration || integration.status !== "connected") {
    throw new Error(`No connected ${campaign.fromProvider} mailbox.`);
  }
  if (!campaign.listId) throw new Error("Campaign has no recipient list.");

  const list = await getList(orgId, campaign.listId);
  const contacts = await getContactsByIds(orgId, list?.contactIds ?? []);

  const campaignRef = adminDb
    .collection("orgs")
    .doc(orgId)
    .collection("campaigns")
    .doc(campaign.id);
  await campaignRef.update({
    status: "sending",
    startedAt: Date.now(),
    updatedAt: Date.now(),
  });

  const subjectTpl = compileTemplate(campaign.subject);
  const bodyTpl = compileTemplate(campaign.body);
  const attachments = await prepareAttachments(campaign);
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
      const html = withComplianceFooter(
        bodyTpl(ctx),
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
        attachments,
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

    await sleep(120); // gentle pacing for mailbox rate limits
  }

  const stats: Campaign["stats"] = {
    total: contacts.length,
    sent,
    failed,
    skipped,
  };
  await campaignRef.update({
    status: failed > 0 && sent === 0 ? "failed" : "sent",
    stats,
    completedAt: Date.now(),
    updatedAt: Date.now(),
  });

  await logEvent(orgId, {
    type: "campaign.sent",
    actorUid,
    summary: `Sent "${campaign.name}" — ${sent} delivered, ${failed} failed, ${skipped} skipped`,
    meta: stats,
  });

  return { stats };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
