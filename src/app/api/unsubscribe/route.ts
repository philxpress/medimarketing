import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyUnsubscribeToken } from "@/lib/email/compliance";

/** Marks a contact as unsubscribed. Idempotent. */
async function unsubscribe(token: string): Promise<boolean> {
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) return false;
  const { orgId, contactId } = parsed;
  const ref = adminDb.collection("orgs").doc(orgId).collection("contacts").doc(contactId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.set({ subscribed: false, updatedAt: Date.now() }, { merge: true });
  await adminDb
    .collection("orgs")
    .doc(orgId)
    .collection("events")
    .add({
      type: "contact.unsubscribed",
      summary: `${snap.data()?.email ?? contactId} unsubscribed`,
      createdAt: Date.now(),
    });
  return true;
}

/** RFC 8058 one-click unsubscribe (mail clients POST here). */
export async function POST(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const ok = await unsubscribe(token);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}

/** Fallback for clients that GET the header URL — redirect to the friendly page. */
export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const token = new URL(req.url).searchParams.get("token") ?? "";
  await unsubscribe(token);
  return NextResponse.redirect(`${base}/unsubscribe?token=${token}&done=1`);
}
