import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg } from "@/lib/auth/session";
import { compileTemplate } from "@/lib/email/merge";
import { withComplianceFooter, unsubscribeUrl } from "@/lib/email/compliance";
import { sendEmail } from "@/lib/email/providers";
import { getIntegrationRaw } from "@/lib/data";
import { fetchAsBase64 } from "@/lib/storage";
import type { MimeAttachment } from "@/lib/email/mime";

// Dynamic: reads cookies/session and does per-request IO — never prerender.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  fromProvider: z.enum(["gmail", "microsoft"]),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        contentType: z.string(),
        size: z.number(),
        url: z.string().url(),
      })
    )
    .optional(),
});

// Sample merge values so tokens render in the preview email.
const SAMPLE = {
  firstName: "Aisha",
  lastName: "Rahman",
  email: "reception@brightsmiledental.example",
  practiceName: "Bright Smile Dental",
  specialty: "Dentistry",
  city: "Austin",
  custom: {},
};

/** Send a one-off test of the current draft to the signed-in user's own email. */
export async function POST(req: NextRequest) {
  try {
    const { orgId, org, user } = await requireOrg();
    const input = schema.parse(await req.json());

    if (!org.postalAddress) {
      return NextResponse.json(
        { error: "Add your postal address in Settings first." },
        { status: 400 }
      );
    }
    const integration = await getIntegrationRaw(orgId, input.fromProvider);
    if (!integration || integration.status !== "connected") {
      return NextResponse.json(
        { error: `No connected ${input.fromProvider} mailbox.` },
        { status: 400 }
      );
    }

    const subject = "[TEST] " + compileTemplate(input.subject)(SAMPLE);
    const html = withComplianceFooter(
      compileTemplate(input.body)(SAMPLE),
      org,
      unsubscribeUrl(orgId, "test")
    );
    const attachments: MimeAttachment[] = input.attachments
      ? await Promise.all(
          input.attachments.map(async (a) => ({
            filename: a.filename,
            contentType: a.contentType,
            contentBase64: await fetchAsBase64(a.url),
          }))
        )
      : [];

    await sendEmail(input.fromProvider, integration, {
      fromName: org.name,
      fromEmail: integration.connectedEmail,
      to: user.email,
      subject,
      html,
      replyTo: org.replyToEmail,
      attachments,
    });

    return NextResponse.json({ ok: true, sentTo: user.email });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
