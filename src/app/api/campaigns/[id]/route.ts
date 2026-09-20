import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import { getCampaign } from "@/lib/data";

export const dynamic = "force-dynamic";

const attachmentSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().nonnegative(),
  url: z.string().url(),
});

/** Fields the wizard may autosave onto a draft. */
const patchSchema = z.object({
  name: z.string().max(140).optional(),
  subject: z.string().max(300).optional(),
  subjectB: z.string().max(300).optional(),
  preheader: z.string().max(300).optional(),
  body: z.string().optional(),
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
  prospecting: z
    .object({
      profession: z.string().max(120).optional(),
      postcode: z.string().max(12).optional(),
      distanceKm: z.number().int().positive().max(1000).optional(),
    })
    .optional(),
  recipientIds: z.array(z.string().min(1)).max(50000).optional(),
  /** When set and in the future, flips the draft to a scheduled send. */
  scheduledAt: z.number().int().positive().nullable().optional(),
});

/** Autosave a draft campaign. Only drafts are editable this way. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { orgId } = await requireOrg();
    const existing = await getCampaign(orgId, params.id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: `Cannot edit a ${existing.status} campaign` },
        { status: 409 }
      );
    }
    const patch = patchSchema.parse(await req.json());
    const update: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(patch)) {
      if (k === "scheduledAt") continue; // handled below
      if (v !== undefined) update[k] = v;
    }
    // Scheduling: a future timestamp flips the draft to "scheduled"; null clears it.
    if (patch.scheduledAt === null) {
      update.scheduledAt = null;
      update.status = "draft";
    } else if (patch.scheduledAt && patch.scheduledAt > Date.now()) {
      update.scheduledAt = patch.scheduledAt;
      update.status = "scheduled";
    }
    await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("campaigns")
      .doc(params.id)
      .set(update, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

/** Delete a draft/failed campaign. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { orgId } = await requireOrg();
    const existing = await getCampaign(orgId, params.id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status === "sending") {
      return NextResponse.json({ error: "Cannot delete while sending" }, { status: 409 });
    }
    await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("campaigns")
      .doc(params.id)
      .delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
