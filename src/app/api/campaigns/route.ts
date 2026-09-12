import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import { getList } from "@/lib/data";
import type { Campaign } from "@/lib/types";
// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

const attachmentSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().nonnegative(),
  url: z.string().url(),
});

const schema = z.object({
  name: z.string().min(1).max(140),
  subject: z.string().min(1).max(300),
  body: z.string().min(1),
  fromProvider: z.enum(["gmail", "microsoft"]).optional(),
  fromEmail: z.string().email().optional(),
  listId: z.string().optional(),
  attachments: z.array(attachmentSchema).max(10).optional(),
  segment: z
    .object({
      specialty: z.string().optional(),
      city: z.string().optional(),
      tag: z.string().optional(),
    })
    .optional(),
  /** "Find Prospects" targeting (profession + radius around a postcode). */
  prospecting: z
    .object({
      profession: z.string().max(120).optional(),
      postcode: z.string().max(12).optional(),
      distanceKm: z.number().int().positive().max(1000).optional(),
    })
    .optional(),
  /** Final set of contact IDs to send to (from the wizard's recipient step). */
  recipientIds: z.array(z.string().min(1)).max(50000).optional(),
  /** Epoch ms; when set (and in the future), the campaign is scheduled. */
  scheduledAt: z.number().int().positive().optional(),
});

/** Create a draft or scheduled campaign. Immediate sending is a separate step. */
export async function POST(req: NextRequest) {
  try {
    const { orgId, user } = await requireOrg();
    const body = schema.parse(await req.json());

    // Prefer the explicit recipient selection for the headline count; fall back
    // to the whole list when the campaign was created without one.
    let total = 0;
    if (body.recipientIds && body.recipientIds.length > 0) {
      total = body.recipientIds.length;
    } else if (body.listId) {
      const list = await getList(orgId, body.listId);
      total = list?.contactIds.length ?? 0;
    }

    const isScheduled = Boolean(body.scheduledAt && body.scheduledAt > Date.now());

    const ref = adminDb.collection("orgs").doc(orgId).collection("campaigns").doc();
    const now = Date.now();
    const campaign: Campaign = {
      id: ref.id,
      name: body.name,
      subject: body.subject,
      body: body.body,
      fromProvider: body.fromProvider ?? "gmail",
      fromEmail: body.fromEmail ?? "",
      listId: body.listId,
      attachments: body.attachments ?? [],
      ...(body.segment && Object.values(body.segment).some(Boolean)
        ? { segment: body.segment }
        : {}),
      ...(body.recipientIds && body.recipientIds.length > 0
        ? { recipientIds: body.recipientIds }
        : {}),
      ...(body.prospecting && Object.values(body.prospecting).some(Boolean)
        ? { prospecting: body.prospecting }
        : {}),
      stats: { total, sent: 0, failed: 0, skipped: 0, opened: 0, clicked: 0 },
      status: isScheduled ? "scheduled" : "draft",
      ...(isScheduled ? { scheduledAt: body.scheduledAt } : {}),
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(campaign);
    return NextResponse.json({ id: ref.id, status: campaign.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
