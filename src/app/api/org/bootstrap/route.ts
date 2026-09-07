import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getCurrentUser, getOrgIdForUser } from "@/lib/auth/session";
import { inviteKey } from "@/lib/data";
import type { Invite, Member, Org } from "@/lib/types";
// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

/**
 * Idempotently ensure the signed-in user belongs to an org.
 * Order of precedence on first login:
 *   1. Already a member → return that org.
 *   2. A pending invite for their email → join that org with the invited role.
 *   3. Otherwise → create a personal org and make them the owner.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const existing = await getOrgIdForUser(user.uid);
  if (existing) return NextResponse.json({ orgId: existing, created: false });

  const decoded = await adminDb.collection("userIndex").doc(user.uid).get();
  if (decoded.exists) {
    return NextResponse.json({ orgId: decoded.data()!.orgId, created: false });
  }

  const now = Date.now();

  // 2. Honor a pending invite.
  if (user.email) {
    const inviteRef = adminDb.collection("invites").doc(inviteKey(user.email));
    const inviteSnap = await inviteRef.get();
    const invite = inviteSnap.data() as Invite | undefined;
    if (invite && invite.status === "pending") {
      const member: Member = {
        uid: user.uid,
        email: user.email,
        displayName: user.email.split("@")[0],
        role: invite.role,
        mfaEnrolled: false,
        createdAt: now,
      };
      const batch = adminDb.batch();
      batch.set(
        adminDb.collection("orgs").doc(invite.orgId).collection("members").doc(user.uid),
        member
      );
      batch.set(adminDb.collection("userIndex").doc(user.uid), {
        orgId: invite.orgId,
        joinedAt: FieldValue.serverTimestamp(),
      });
      batch.set(inviteRef, { status: "accepted", acceptedAt: now }, { merge: true });
      await batch.commit();
      return NextResponse.json({ orgId: invite.orgId, created: false, joined: true });
    }
  }

  // 3. Create a personal org.
  const orgRef = adminDb.collection("orgs").doc();
  const org: Org = {
    id: orgRef.id,
    name: user.email ? `${user.email.split("@")[0]}'s workspace` : "My workspace",
    createdAt: now,
    postalAddress: "",
  };
  const member: Member = {
    uid: user.uid,
    email: user.email,
    displayName: user.email.split("@")[0],
    role: "owner",
    mfaEnrolled: false,
    createdAt: now,
  };

  const batch = adminDb.batch();
  batch.set(orgRef, org);
  batch.set(orgRef.collection("members").doc(user.uid), member);
  batch.set(adminDb.collection("userIndex").doc(user.uid), {
    orgId: orgRef.id,
    joinedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return NextResponse.json({ orgId: orgRef.id, created: true });
}
