import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";

const schema = z.object({
  name: z.string().min(1).max(120),
  postalAddress: z.string().min(1).max(400),
  replyToEmail: z.string().email().optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  try {
    const { orgId, member } = await requireOrg();
    if (member.role === "member") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    const body = schema.parse(await req.json());
    await adminDb
      .collection("orgs")
      .doc(orgId)
      .set(
        {
          name: body.name,
          postalAddress: body.postalAddress,
          replyToEmail: body.replyToEmail || undefined,
        },
        { merge: true }
      );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
