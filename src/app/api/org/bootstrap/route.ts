import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getCurrentUser, getOrgIdForUser } from "@/lib/auth/session";
import type { Member, Org } from "@/lib/types";
// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

/**
 * Idempotently ensure the signed-in user belongs to an org.
 * On first login we create a personal org and make them the owner. The
 * onboarding screen then collects the org name + required postal address.
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

  const orgRef = adminDb.collection("orgs").doc();
  const now = Date.now();
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
