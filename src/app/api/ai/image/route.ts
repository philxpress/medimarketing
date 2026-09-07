import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg } from "@/lib/auth/session";
import { generateImage } from "@/lib/ai/generate";

const schema = z.object({ prompt: z.string().min(3).max(1000) });

export async function POST(req: NextRequest) {
  try {
    await requireOrg();
    const { prompt } = schema.parse(await req.json());
    const result = await generateImage(prompt);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
