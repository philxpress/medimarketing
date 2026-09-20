import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg } from "@/lib/auth/session";
import { generateImage } from "@/lib/ai/generate";
import { uploadImage } from "@/lib/storage";
import { planFor } from "@/lib/plans";
// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";

const schema = z.object({ prompt: z.string().min(3).max(1000) });

export async function POST(req: NextRequest) {
  try {
    const { orgId, org } = await requireOrg();
    if (!planFor(org.plan).aiImages) {
      return NextResponse.json(
        { error: "AI images aren't included in your plan. Upgrade to enable them." },
        { status: 403 }
      );
    }
    const { prompt } = schema.parse(await req.json());
    const { dataUrl } = await generateImage(prompt);

    // Host the image and return its URL — inline base64 images don't render in
    // Gmail/Outlook, so we never embed the data URL in the email.
    const b64 = dataUrl.split(",")[1] ?? "";
    const buffer = Buffer.from(b64, "base64");
    const stored = await uploadImage(orgId, buffer, "image/png", "png");
    return NextResponse.json({ url: stored.url });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
