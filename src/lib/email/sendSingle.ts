/**
 * Send one merged, compliant email to a single contact. Used by journeys.
 * (Journey emails carry merge + compliance/unsubscribe; open/click tracking is
 * campaign-only for now.)
 */
import "server-only";
import { compileTemplate, contactToMergeContext } from "@/lib/email/merge";
import {
  withComplianceFooter,
  unsubscribeUrl,
  oneClickUnsubscribeUrl,
} from "@/lib/email/compliance";
import { sendEmail } from "@/lib/email/providers";
import type { Contact, Integration, IntegrationProvider, Org } from "@/lib/types";

export async function sendSingle(
  orgId: string,
  org: Org,
  provider: IntegrationProvider,
  integration: Integration,
  contact: Contact,
  subject: string,
  body: string
): Promise<void> {
  const ctx = contactToMergeContext(contact);
  const html = withComplianceFooter(
    compileTemplate(body)(ctx),
    org,
    unsubscribeUrl(orgId, contact.id)
  );
  await sendEmail(provider, integration, {
    fromName: org.name,
    fromEmail: integration.connectedEmail,
    to: contact.email,
    subject: compileTemplate(subject)(ctx),
    html,
    unsubscribeUrl: oneClickUnsubscribeUrl(orgId, contact.id),
    replyTo: org.replyToEmail,
  });
}
