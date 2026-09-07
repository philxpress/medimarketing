import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth } from "@/lib/firebase/admin";
import { createSessionCookie, clearSessionCookie } from "@/lib/auth/session";

const bodySchema = z.object({ idToken: z.string().min(20) });

export async function POST(req: NextRequest) {
  try {
    const { idToken } = bodySchema.parse(await req.json());
    // Verify before minting a cookie so we never trust an unverified token.
    await adminAuth.verifyIdToken(idToken);
    await createSessionCookie(idToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid token", detail: String(err) },
      { status: 401 }
    );
  }
}

export async function DELETE() {
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}
