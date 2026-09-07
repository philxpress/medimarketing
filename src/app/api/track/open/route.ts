import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { verifyTrackToken } from "@/lib/email/tracking";

// Dynamic: per-request tracking, never prerendered.
export const dynamic = "force-dynamic";

// 1x1 transparent GIF.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

function pixelResponse() {
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const parsed = verifyTrackToken(token);
  if (parsed) {
    try {
      const { orgId, campaignId, contactId } = parsed;
      const recRef = adminDb
        .collection("orgs")
        .doc(orgId)
        .collection("campaigns")
        .doc(campaignId)
        .collection("recipients")
        .doc(contactId);
      const campRef = adminDb
        .collection("orgs")
        .doc(orgId)
        .collection("campaigns")
        .doc(campaignId);

      await adminDb.runTransaction(async (tx) => {
        const rec = await tx.get(recRef);
        const firstOpen = !rec.data()?.openedAt;
        tx.set(
          recRef,
          {
            openedAt: rec.data()?.openedAt ?? Date.now(),
            opens: FieldValue.increment(1),
          },
          { merge: true }
        );
        if (firstOpen) {
          tx.set(campRef, { stats: { opened: FieldValue.increment(1) } }, { merge: true });
        }
      });
    } catch {
      // Never let tracking failures block the pixel.
    }
  }
  return pixelResponse();
}
