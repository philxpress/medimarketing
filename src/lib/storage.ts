/**
 * Attachment storage via Vercel Blob.
 * Requires a Blob store connected to the Vercel project (adds
 * BLOB_READ_WRITE_TOKEN automatically). Files are stored under a per-org prefix
 * with a random suffix so URLs are unguessable.
 */
import "server-only";
import { put } from "@vercel/blob";

export interface StoredFile {
  url: string;
  filename: string;
  contentType: string;
  size: number;
}

export function storageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function uploadAttachment(
  orgId: string,
  filename: string,
  data: Buffer,
  contentType: string
): Promise<StoredFile> {
  if (!storageConfigured()) {
    throw new Error(
      "Attachment storage is not configured. Create a Vercel Blob store and connect it to this project."
    );
  }
  const safe = filename.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file";
  const blob = await put(`orgs/${orgId}/attachments/${safe}`, data, {
    access: "public",
    addRandomSuffix: true,
    contentType,
  });
  return { url: blob.url, filename, contentType, size: data.length };
}

/**
 * Store an inline email image and return its public URL. Inlined base64
 * (`data:`) images are stripped by Gmail/Outlook, so campaign images MUST be
 * hosted and referenced by https URL.
 */
export async function uploadImage(
  orgId: string,
  data: Buffer,
  contentType: string,
  ext = "png"
): Promise<StoredFile> {
  if (!storageConfigured()) {
    throw new Error(
      "Image hosting is not configured. Create a Vercel Blob store and connect it to this project."
    );
  }
  const blob = await put(`orgs/${orgId}/images/ai-${Date.now()}.${ext}`, data, {
    access: "public",
    addRandomSuffix: true,
    contentType,
  });
  return { url: blob.url, filename: `image.${ext}`, contentType, size: data.length };
}

/** Fetch an attachment's bytes (at send time) and return as base64. */
export async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch attachment (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("base64");
}
