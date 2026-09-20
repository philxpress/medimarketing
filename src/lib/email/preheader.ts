/**
 * Preheader = the preview text inboxes show after the subject line. It's a
 * hidden block at the very top of the HTML body, padded so the visible body copy
 * doesn't bleed into the preview.
 */
import "server-only";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function withPreheader(html: string, preheader: string): string {
  const text = preheader.trim();
  if (!text) return html;
  // Zero-width padding pushes trailing body text out of the preview snippet.
  const pad = "‌ ".repeat(60);
  const block = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0;">${escapeHtml(
    text
  )}${pad}</div>`;
  return block + html;
}
