/**
 * Campaign send pipeline — queue based.
 *
 * `startCampaignSend` seeds one recipient doc per contact (status "pending",
 * with A/B variant assigned) and flips the campaign to "sending", then runs the
 * first batch inline. `processCampaignBatch` sends the next slice of pending
 * recipients and is called repeatedly by the cron until none remain — so a send
 * of any size survives serverless time limits and resumes cleanly.
 *
 * Each batch reserves quota against the mailbox's daily limit and the org's
 * monthly plan limit; when quota is exhausted the remaining recipients stay
 * "pending" and the next cron tick (or next day) picks them up.
 */
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
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
import { injectTracking } from "@/lib/email/tracking";
import { withPreheader } from "@/lib/email/preheader";
import { reserveQuota, refundSend, monthlyRemaining } from "@/lib/email/limits";
import { planFor } from "@/lib/plans";
import { suppressedSubset, addSuppression } from "@/lib/email/suppression";
import { markIntegrationError, isAuthError } from "@/lib/email/health";
import type { MimeAttachment } from "@/lib/email/mime";
import { fetchAsBase64 } from "@/lib/storage";
import type { Campaign, CampaignSegment, Contact, Recipient } from "@/lib/types";
import { DEFAULT_TIMEZONE } from "@/lib/tz";

/** Recipients processed per batch — kept small enough to finish inside 60s. */
export const BATCH_SIZE = 60;

/** Apply a campaign's optional segment filter to a contact. */
function matchesSegment(c: Contact, seg?: CampaignSegment): boolean {
  if (!seg) return true;
  if (seg.specialty && (c.specialty ?? "") !== seg.specialty) return false;
  if (seg.city && (c.city ?? "") !== seg.city) return false;
  if (seg.tag && !(c.tags ?? []).includes(seg.tag)) return false;
  return true;
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

function campaignRef(orgId: string, campaignId: string) {
  return adminDb.collection("orgs").doc(orgId).collection("campaigns").doc(campaignId);
}

export interface BatchResult {
  processed: number;
  remaining: number;
  /** True when a quota ceiling stopped the batch before clearing the queue. */
  quotaExhausted: boolean;
  done: boolean;
}

/**
 * Validate, resolve the audience, seed pending recipient docs, mark the campaign
 * "sending", then process the first batch inline.
 */
export async function startCampaignSend(
  orgId: string,
  campaignId: string,
  actorUid?: string,
  budgetMs = 45000
): Promise<BatchResult> {
  const campaign = await getCampaign(orgId, campaignId);
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "sending" || campaign.status === "sent") {
    throw new Error(`Campaign already ${campaign.status}`);
  }

  const orgSnap = await adminDb.collection("orgs").doc(orgId).get();
  const org = orgSnap.data() as import("@/lib/types").Org;
  if (!org?.postalAddress) {
    throw new Error("Add your postal address in Settings before sending.");
  }
  const integration = await getIntegrationRaw(orgId, campaign.fromProvider);
  if (!integration || integration.status !== "connected") {
    throw new Error(`No connected ${campaign.fromProvider} mailbox. Reconnect it in Settings.`);
  }

  // Plan gate: don't start a send with no monthly allowance left.
  const tz = org.timezone ?? DEFAULT_TIMEZONE;
  const remaining = monthlyRemaining(
    planFor(org.plan),
    org.sentThisMonth,
    org.sentMonth,
    tz
  );
  if (remaining <= 0) {
    throw new Error(
      "You've reached your plan's monthly send limit. Upgrade your plan to send more this month."
    );
  }

  // Resolve the audience: explicit recipient selection wins, else the list
  // narrowed by the segment filter.
  let contacts: Contact[];
  if (campaign.recipientIds && campaign.recipientIds.length > 0) {
    contacts = await getContactsByIds(orgId, campaign.recipientIds);
  } else {
    if (!campaign.listId) throw new Error("Campaign has no recipient list.");
    const list = await getList(orgId, campaign.listId);
    const all = await getContactsByIds(orgId, list?.contactIds ?? []);
    contacts = all.filter((c) => matchesSegment(c, campaign.segment));
  }

  // Which of these are on the suppression list (bounced/complained/manual)?
  const suppressed = await suppressedSubset(
    orgId,
    contacts.map((c) => c.email)
  );

  // Seed a recipient doc per contact. Unsubscribed/suppressed → "skipped".
  const ref = campaignRef(orgId, campaignId);
  const recipients = ref.collection("recipients");
  let batch = adminDb.batch();
  let ops = 0;
  let skipped = 0;
  const useAb = Boolean(campaign.subjectB?.trim());
  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    const rref = recipients.doc(c.id);
    if (!c.subscribed || suppressed.has(c.email.toLowerCase())) {
      skipped++;
      batch.set(rref, {
        id: c.id,
        email: c.email,
        status: "skipped",
        error: !c.subscribed ? "unsubscribed" : "suppressed",
      } satisfies Recipient);
    } else {
      batch.set(rref, {
        id: c.id,
        email: c.email,
        status: "pending",
        variant: useAb ? (i % 2 === 0 ? "A" : "B") : "A",
      } satisfies Recipient);
    }
    if (++ops >= 400) {
      await batch.commit();
      batch = adminDb.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();

  await ref.update({
    status: "sending",
    startedAt: Date.now(),
    updatedAt: Date.now(),
    "stats.total": contacts.length,
    "stats.skipped": skipped,
    "stats.sent": 0,
    "stats.failed": 0,
    "stats.bounced": 0,
  });

  return drainCampaign(orgId, campaignId, budgetMs, actorUid);
}

/**
 * Process batches back-to-back until the queue is empty, quota is exhausted, or
 * the time budget runs out (so a single serverless invocation sends as much as
 * it safely can; the resume cron picks up whatever's left).
 */
export async function drainCampaign(
  orgId: string,
  campaignId: string,
  budgetMs = 45000,
  actorUid?: string
): Promise<BatchResult> {
  const deadline = Date.now() + budgetMs;
  let last: BatchResult = {
    processed: 0,
    remaining: 0,
    quotaExhausted: false,
    done: false,
  };
  do {
    last = await processCampaignBatch(orgId, campaignId, BATCH_SIZE, actorUid);
    if (last.done || last.quotaExhausted) break;
  } while (Date.now() < deadline);
  return last;
}

/**
 * Send the next slice of pending recipients. Idempotent and resumable: safe to
 * call repeatedly until `done` is true.
 */
export async function processCampaignBatch(
  orgId: string,
  campaignId: string,
  max = BATCH_SIZE,
  actorUid?: string
): Promise<BatchResult> {
  const campaign = await getCampaign(orgId, campaignId);
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status !== "sending") {
    return { processed: 0, remaining: 0, quotaExhausted: false, done: true };
  }

  const orgSnap = await adminDb.collection("orgs").doc(orgId).get();
  const org = orgSnap.data() as import("@/lib/types").Org;
  const tz = org.timezone ?? DEFAULT_TIMEZONE;
  const integration = await getIntegrationRaw(orgId, campaign.fromProvider);
  if (!integration || integration.status !== "connected") {
    await campaignRef(orgId, campaignId).update({ status: "failed", updatedAt: Date.now() });
    return { processed: 0, remaining: 0, quotaExhausted: false, done: true };
  }

  const ref = campaignRef(orgId, campaignId);
  const pendingSnap = await ref
    .collection("recipients")
    .where("status", "==", "pending")
    .limit(max)
    .get();

  if (pendingSnap.empty) {
    await finalize(orgId, campaignId, actorUid);
    return { processed: 0, remaining: 0, quotaExhausted: false, done: true };
  }

  // Reserve monthly plan quota for this batch. If none left, pause the queue.
  const quota = await reserveQuota(orgId, tz, pendingSnap.size);
  if (quota.allowed === 0) {
    return {
      processed: 0,
      remaining: pendingSnap.size,
      quotaExhausted: true,
      done: false,
    };
  }

  const toSend = pendingSnap.docs.slice(0, quota.allowed);
  const contactIds = toSend.map((d) => d.id);
  const contacts = await getContactsByIds(orgId, contactIds);
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  const subjectATpl = compileTemplate(campaign.subject);
  const subjectBTpl = campaign.subjectB ? compileTemplate(campaign.subjectB) : null;
  const bodyTpl = compileTemplate(campaign.body);
  const preheaderTpl = campaign.preheader ? compileTemplate(campaign.preheader) : null;
  const attachments = await prepareAttachments(campaign);
  const fromName = org.name;

  let sent = 0;
  let failed = 0;

  for (const doc of toSend) {
    const rref = doc.ref;
    const rec = doc.data() as Recipient;
    const contact = contactById.get(doc.id);
    if (!contact) {
      failed++;
      await refundSend(orgId);
      await rref.set({ status: "failed", error: "contact deleted" }, { merge: true });
      continue;
    }
    try {
      const ctx = contactToMergeContext(contact);
      const subjectTpl = rec.variant === "B" && subjectBTpl ? subjectBTpl : subjectATpl;
      const subject = subjectTpl(ctx);
      let html = bodyTpl(ctx);
      if (preheaderTpl) html = withPreheader(html, preheaderTpl(ctx));
      const tracked = injectTracking(html, orgId, campaign.id, contact.id);
      const withFooter = withComplianceFooter(
        tracked,
        org,
        unsubscribeUrl(orgId, contact.id)
      );

      const result = await sendEmail(campaign.fromProvider, integration, {
        fromName,
        fromEmail: integration.connectedEmail,
        to: contact.email,
        subject,
        html: withFooter,
        unsubscribeUrl: oneClickUnsubscribeUrl(orgId, contact.id),
        replyTo: org.replyToEmail,
        attachments,
      });

      sent++;
      await rref.set(
        {
          status: "sent",
          providerMessageId: result.messageId,
          sentAt: Date.now(),
        },
        { merge: true }
      );
    } catch (err) {
      failed++;
      await refundSend(orgId);
      await rref.set({ status: "failed", error: String(err).slice(0, 300) }, { merge: true });
      // An auth failure means the mailbox needs reconnecting — stop the batch so
      // we don't burn the whole queue against a dead token.
      if (isAuthError(err)) {
        await markIntegrationError(orgId, campaign.fromProvider, String(err));
        break;
      }
    }
    await sleep(100); // gentle pacing for mailbox rate limits
  }

  await ref.update({
    "stats.sent": FieldValue.increment(sent),
    "stats.failed": FieldValue.increment(failed),
    updatedAt: Date.now(),
  });

  const remainingSnap = await ref
    .collection("recipients")
    .where("status", "==", "pending")
    .limit(1)
    .get();
  const remaining = remainingSnap.size;
  let done = false;
  if (remaining === 0) {
    await finalize(orgId, campaignId, actorUid);
    done = true;
  }

  return { processed: sent + failed, remaining, quotaExhausted: false, done };
}

/** Set the final status once the queue is empty and log the outcome. */
async function finalize(orgId: string, campaignId: string, actorUid?: string) {
  const ref = campaignRef(orgId, campaignId);
  const snap = await ref.get();
  const c = snap.data() as Campaign | undefined;
  if (!c || c.status !== "sending") return;
  const sent = c.stats?.sent ?? 0;
  const failed = c.stats?.failed ?? 0;
  const skipped = c.stats?.skipped ?? 0;
  await ref.update({
    status: failed > 0 && sent === 0 ? "failed" : "sent",
    completedAt: Date.now(),
    updatedAt: Date.now(),
  });
  await logEvent(orgId, {
    type: "campaign.sent",
    actorUid,
    summary: `Sent "${c.name}" — ${sent} delivered, ${failed} failed, ${skipped} skipped`,
    meta: { sent, failed, skipped },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
