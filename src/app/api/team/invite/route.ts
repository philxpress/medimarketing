import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import { inviteKey, logEvent } from "@/lib/data";
import type { Invite } from "@/lib/types";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]),
});

/** Invite a teammate to the org. Owners and admins only. */
export async function POST(req: NextRequest) {
  try {
    const { orgId, org, member, user } = await requireOrg();
    if (member.role === "member") {
      return NextResponse.json({ error: "Only owners and admins can invite." }, { status: 403 });
    }
    const b = schema.parse(await req.json());
    const email = b.email.trim().toLowerCase();

    // Already a member?
    const existingMember = await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("members")
      .where("email", "==", email)
      .limit(1)
      .get();
    if (!existingMember.empty) {
      return NextResponse.json({ error: "That person is already a member." }, { status: 409 });
    }

    // One invite per email globally (single-org membership in this MVP).
    const ref = adminDb.collection("invites").doc(inviteKey(email));
    const existing = (await ref.get()).data() as Invite | undefined;
    if (existing && existing.status === "pending" && existing.orgId !== orgId) {
      return NextResponse.json(
        { error: "That email already has a pending invite elsewhere." },
        { status: 409 }
      );
    }

    const invite: Invite = {
      email,
      orgId,
      orgName: org.name,
      role: b.role,
      invitedByUid: user.uid,
      invitedByName: member.displayName || member.email,
      status: "pending",
      createdAt: Date.now(),
    };
    await ref.set(invite);
    await logEvent(orgId, {
      type: "member.invited",
      actorUid: user.uid,
      summary: `Invited ${email} as ${b.role}`,
    });

    return NextResponse.json({ ok: true, email });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
