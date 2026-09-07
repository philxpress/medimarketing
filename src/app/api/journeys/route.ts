import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireOrg } from "@/lib/auth/session";
import type { Journey } from "@/lib/types";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(1).max(140),
  description: z.string().max(500).optional(),
  fromProvider: z.enum(["gmail", "microsoft"]),
  fromEmail: z.string().email(),
  steps: z
    .array(
      z.object({
        delayHours: z.number().int().min(0).max(24 * 365),
        subject: z.string().min(1).max(300),
        body: z.string().min(1),
      })
    )
    .min(1)
    .max(20),
});

/** Create a journey (starts inactive/paused). */
export async function POST(req: NextRequest) {
  try {
    const { orgId } = await requireOrg();
    const b = schema.parse(await req.json());
    const ref = adminDb.collection("orgs").doc(orgId).collection("journeys").doc();
    const now = Date.now();
    const journey: Journey = {
      id: ref.id,
      name: b.name,
      description: b.description,
      fromProvider: b.fromProvider,
      fromEmail: b.fromEmail,
      steps: b.steps,
      active: false,
      enrolledCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(JSON.parse(JSON.stringify(journey)));
    return NextResponse.json({ id: ref.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
