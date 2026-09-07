import { NextRequest, NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/session";
import { uploadAttachment, storageConfigured } from "@/lib/storage";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cap uploads to keep provider payloads sane (Gmail ~25MB total incl. base64).
const MAX_BYTES = 15 * 1024 * 1024;

/** Accepts a multipart file upload, stores it in Vercel Blob, returns metadata. */
export async function POST(req: NextRequest) {
  try {
    const { orgId } = await requireOrg();
    if (!storageConfigured()) {
      return NextResponse.json(
        {
          error:
            "Attachment storage isn't set up yet. In Vercel: Storage → Create a Blob store → connect it to this project, then redeploy.",
        },
        { status: 501 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` },
        { status: 413 }
      );
    }

    const data = Buffer.from(await file.arrayBuffer());
    const stored = await uploadAttachment(
      orgId,
      file.name,
      data,
      file.type || "application/octet-stream"
    );
    return NextResponse.json(stored);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
