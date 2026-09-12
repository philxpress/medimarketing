import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requirePlatformAdmin } from "@/lib/auth/platformAdmin";
import { inviteKey } from "@/lib/data";
import type { Invite, Org } from "@/lib/types";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

const schema = z.object({
  companyName: z.string().min(1).max(120),
  adminEmail: z.string().email(),
  plan: z.string().max(60).optional(),
  timezone: z.string().max(64).optional(),
});

/**
 * Create a company (org) and invite its admin as owner. The invite is honored
 * by /api/org/bootstrap when that person first signs in.
 */
export async function POST(req: NextRequest) {
  try {
    await requirePlatformAdmin();
    const b = schema.parse(await req.json());
    const email = b.adminEmail.trim().toLowerCase();

    // Respect the one-invite-per-email / single-org rule used elsewhere.
    const inviteRef = adminDb.collection("invites").doc(inviteKey(email));
    const existing = (await inviteRef.get()).data() as Invite | undefined;
    if (existing && existing.status === "pending") {
      return NextResponse.json(
        { error: "That email already has a pending invite. Revoke it first." },
        { status: 409 }
      );
    }

    const now = Date.now();
    const orgRef = adminDb.collection("orgs").doc();
    const org: Org = {
      id: orgRef.id,
      name: b.companyName,
      createdAt: now,
      postalAddress: "",
      timezone: b.timezone || "Australia/Sydney",
      plan: b.plan || "trial",
      ownerEmail: email,
    };
    const invite: Invite = {
      email,
      orgId: orgRef.id,
      orgName: org.name,
      role: "owner",
      invitedByUid: "platform-admin",
      invitedByName: "Platform admin",
      status: "pending",
      createdAt: now,
    };

    const batch = adminDb.batch();
    batch.set(orgRef, org);
    batch.set(inviteRef, invite);
    await batch.commit();

    return NextResponse.json({ orgId: orgRef.id, invited: email });
  } catch (err) {
    const status = String(err).includes("FORBIDDEN") ? 403 : 400;
    return NextResponse.json({ error: String(err) }, { status });
  }
}
