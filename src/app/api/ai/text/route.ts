import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg } from "@/lib/auth/session";
import { generateText } from "@/lib/ai/generate";

const schema = z.object({
  prompt: z.string().min(3).max(2000),
  tone: z.string().max(60).optional(),
  purpose: z.enum(["subject", "body", "both"]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireOrg(); // gate behind auth so we don't proxy AI for anonymous users
    const input = schema.parse(await req.json());
    const result = await generateText(input);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
