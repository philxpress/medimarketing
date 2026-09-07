import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg, getCurrentUser } from "@/lib/auth/session";
import { logEvent } from "@/lib/data";
// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

/** Records that the current member has enrolled a second factor. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { orgId } = await requireOrg();
  await adminDb
    .collection("orgs")
    .doc(orgId)
    .collection("members")
    .doc(user.uid)
    .set({ mfaEnrolled: true }, { merge: true });
  await logEvent(orgId, {
    type: "mfa.enrolled",
    actorUid: user.uid,
    summary: `${user.email} enabled two-factor authentication`,
  });
  return NextResponse.json({ ok: true });
}
