import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requirePlatformAdmin } from "@/lib/auth/platformAdmin";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

const schema = z.object({
  plan: z.string().max(60).optional(),
  name: z.string().min(1).max(120).optional(),
});

/** Update a company's plan label or name. Platform admin only. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePlatformAdmin();
    const b = schema.parse(await req.json());
    const patch: Record<string, unknown> = {};
    if (b.plan !== undefined) patch.plan = b.plan;
    if (b.name !== undefined) patch.name = b.name;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }
    const ref = adminDb.collection("orgs").doc(params.id);
    if (!(await ref.get()).exists) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }
    await ref.set(patch, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = String(err).includes("FORBIDDEN") ? 403 : 400;
    return NextResponse.json({ error: String(err) }, { status });
  }
}
