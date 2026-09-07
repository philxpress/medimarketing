import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { verifyTrackToken } from "@/lib/email/tracking";

// Dynamic: per-request tracking, never prerendered.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  const target = url.searchParams.get("u") ?? "";
  const parsed = verifyTrackToken(token);

  // Only redirect to a valid http(s) URL to avoid an open-redirect.
  let dest = "/";
  try {
    const u = new URL(target);
    if (u.protocol === "http:" || u.protocol === "https:") dest = u.toString();
  } catch {
    /* fall through to "/" */
  }

  if (parsed && dest !== "/") {
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
        const firstClick = !rec.data()?.clickedAt;
        tx.set(
          recRef,
          {
            clickedAt: rec.data()?.clickedAt ?? Date.now(),
            clicks: FieldValue.increment(1),
            lastClickedUrl: dest,
            // A click implies an open, even if the pixel was blocked.
            openedAt: rec.data()?.openedAt ?? Date.now(),
          },
          { merge: true }
        );
        const inc: Record<string, unknown> = {};
        if (firstClick) inc.clicked = FieldValue.increment(1);
        if (!rec.data()?.openedAt) inc.opened = FieldValue.increment(1);
        if (Object.keys(inc).length) tx.set(campRef, { stats: inc }, { merge: true });
      });
    } catch {
      /* never block the redirect */
    }
  }

  return NextResponse.redirect(dest, 302);
}
