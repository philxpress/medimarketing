import "server-only";
import type { Integration, IntegrationProvider } from "@/lib/types";
import type { OutgoingEmail } from "@/lib/email/mime";
import { sendViaGmail } from "./gmail";
import { sendViaGraph } from "./microsoft";

export interface SendResult {
  messageId: string;
}

/** Dispatch a single message to the correct mailbox provider. */
export async function sendEmail(
  provider: IntegrationProvider,
  integration: Integration,
  email: OutgoingEmail
): Promise<SendResult> {
  switch (provider) {
    case "gmail":
      return sendViaGmail(integration, email);
    case "microsoft":
      return sendViaGraph(integration, email);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
