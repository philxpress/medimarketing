/**
 * Minimal RFC 5322 MIME builder for a single HTML email.
 * Kept dependency-free so both the Gmail and Graph senders can reuse it.
 */
import "server-only";

export interface OutgoingEmail {
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
  /** URL used for the one-click List-Unsubscribe header (RFC 8058). */
  unsubscribeUrl?: string;
  replyTo?: string;
}

function encodeHeader(value: string): string {
  // RFC 2047 encode non-ASCII header values (e.g. names with accents).
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Returns a raw RFC 5322 message string. */
export function buildMime(email: OutgoingEmail): string {
  const boundary = "medireach_" + Math.random().toString(36).slice(2);
  const headers: string[] = [
    `From: ${encodeHeader(email.fromName)} <${email.fromEmail}>`,
    `To: ${email.to}`,
    `Subject: ${encodeHeader(email.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (email.replyTo) headers.push(`Reply-To: ${email.replyTo}`);
  if (email.unsubscribeUrl) {
    headers.push(`List-Unsubscribe: <${email.unsubscribeUrl}>`);
    headers.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  }

  const plain = htmlToPlain(email.html);
  const body = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    plain,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    email.html,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return headers.join("\r\n") + "\r\n\r\n" + body;
}

function htmlToPlain(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>(?=)/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
