import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import type { Template } from "@/lib/types";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(1).max(140),
  subject: z.string().min(1).max(300),
  body: z.string().min(1),
});

/** Save a reusable email template. */
export async function POST(req: NextRequest) {
  try {
    const { orgId } = await requireOrg();
    const body = schema.parse(await req.json());
    const ref = adminDb.collection("orgs").doc(orgId).collection("templates").doc();
    const now = Date.now();
    const template: Template = {
      id: ref.id,
      name: body.name,
      subject: body.subject,
      body: body.body,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(template);
    return NextResponse.json({ id: ref.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
