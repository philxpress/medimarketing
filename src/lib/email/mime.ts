/**
 * Minimal RFC 5322 MIME builder for an HTML email, with optional attachments.
 * Dependency-free so both the Gmail and Graph senders can reuse it.
 */
import "server-only";

export interface MimeAttachment {
  filename: string;
  contentType: string;
  /** Raw bytes as a base64 string. */
  contentBase64: string;
}

export interface OutgoingEmail {
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
  /** URL used for the one-click List-Unsubscribe header (RFC 8058). */
  unsubscribeUrl?: string;
  replyTo?: string;
  attachments?: MimeAttachment[];
}

function encodeHeader(value: string): string {
  // RFC 2047 encode non-ASCII header values (e.g. names with accents).
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function rand() {
  return Math.random().toString(36).slice(2);
}

/** Split a base64 string into 76-char lines per RFC 2045. */
function chunk76(b64: string): string {
  return b64.replace(/.{76}/g, "$&\r\n");
}

/** Returns a raw RFC 5322 message string. */
export function buildMime(email: OutgoingEmail): string {
  const hasAttachments = (email.attachments?.length ?? 0) > 0;
  const altBoundary = "alt_" + rand();
  const mixedBoundary = "mixed_" + rand();

  const headers: string[] = [
    `From: ${encodeHeader(email.fromName)} <${email.fromEmail}>`,
    `To: ${email.to}`,
    `Subject: ${encodeHeader(email.subject)}`,
    "MIME-Version: 1.0",
  ];
  if (email.replyTo) headers.push(`Reply-To: ${email.replyTo}`);
  if (email.unsubscribeUrl) {
    headers.push(`List-Unsubscribe: <${email.unsubscribeUrl}>`);
    headers.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  }

  const plain = htmlToPlain(email.html);
  const altPart = [
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    plain,
    "",
    `--${altBoundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    email.html,
    "",
    `--${altBoundary}--`,
  ].join("\r\n");

  if (!hasAttachments) {
    return headers.join("\r\n") + "\r\n" + altPart + "\r\n";
  }

  // multipart/mixed wrapping the alternative body + each attachment.
  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
  const parts: string[] = [
    `--${mixedBoundary}`,
    altPart,
    "",
  ];
  for (const att of email.attachments!) {
    parts.push(
      `--${mixedBoundary}`,
      `Content-Type: ${att.contentType}; name="${att.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${att.filename}"`,
      "",
      chunk76(att.contentBase64),
      ""
    );
  }
  parts.push(`--${mixedBoundary}--`, "");

  return headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n");
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
