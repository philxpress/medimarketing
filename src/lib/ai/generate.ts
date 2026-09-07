/**
 * AI generation for campaign content.
 *  - Text/copy: Anthropic Claude (Messages API).
 *  - Images: OpenAI image generation (optional; disabled if no key).
 *
 * All prompts are wrapped with medical-sector guardrails: no clinical claims,
 * no PHI, professional B2B tone.
 */
import "server-only";

const MEDICAL_GUARDRAILS = `You write B2B marketing email copy for a company selling to
medical practices, clinics, and healthcare professionals. Rules:
- Professional, concise, trustworthy tone. No hype or fake urgency.
- Never invent clinical outcomes, statistics, endorsements, or regulatory claims.
- Never include patient data or protected health information.
- Do not make medical or diagnostic assertions.
- Output clean HTML suitable for an email body (use <p>, <ul>, <a>; no <html>/<head>).
- Use merge tokens like {{firstName}} and {{practiceName}} where a personal touch fits.`;

export interface GenerateTextInput {
  prompt: string;
  tone?: string;
  purpose?: "subject" | "body" | "both";
}

export interface GenerateTextResult {
  subject?: string;
  body?: string;
  raw: string;
}

export async function generateText(
  input: GenerateTextInput
): Promise<GenerateTextResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

  const wantsSubject = input.purpose !== "body";
  const wantsBody = input.purpose !== "subject";
  const instruction = [
    input.tone ? `Tone: ${input.tone}.` : "",
    `Task: ${input.prompt}`,
    wantsSubject && wantsBody
      ? `Return a JSON object: {"subject": "...", "body": "<html>"}. No prose outside the JSON.`
      : wantsSubject
        ? `Return only a subject line, no quotes.`
        : `Return only the HTML email body.`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: MEDICAL_GUARDRAILS,
      messages: [{ role: "user", content: instruction }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  const raw: string =
    data?.content?.map((b: { text?: string }) => b.text ?? "").join("") ?? "";

  if (wantsSubject && wantsBody) {
    const parsed = tryParseJson(raw);
    if (parsed) return { subject: parsed.subject, body: parsed.body, raw };
    return { body: raw, raw };
  }
  return wantsSubject ? { subject: raw.trim(), raw } : { body: raw, raw };
}

function tryParseJson(s: string): { subject?: string; body?: string } | null {
  const match = s.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export interface GenerateImageResult {
  /** Data URL (base64) so the caller can upload it wherever it likes. */
  dataUrl: string;
}

export async function generateImage(prompt: string): Promise<GenerateImageResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Image generation is not configured (OPENAI_API_KEY)");

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: `Clean, professional marketing image for a medical/healthcare B2B audience. ${prompt}`,
      size: "1024x1024",
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI image API error (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned");
  return { dataUrl: `data:image/png;base64,${b64}` };
}
