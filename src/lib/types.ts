/**
 * MediReach data model — shared across client and server.
 *
 * Firestore layout (all under an org for multi-tenant isolation):
 *   orgs/{orgId}
 *   orgs/{orgId}/members/{uid}
 *   orgs/{orgId}/integrations/{provider}          (gmail | microsoft)
 *   orgs/{orgId}/contacts/{contactId}
 *   orgs/{orgId}/lists/{listId}
 *   orgs/{orgId}/templates/{templateId}
 *   orgs/{orgId}/campaigns/{campaignId}
 *   orgs/{orgId}/campaigns/{campaignId}/recipients/{recipientId}
 *   orgs/{orgId}/events/{eventId}                 (audit log)
 *   userIndex/{uid}                               (uid -> orgId lookup)
 */

export type Role = "owner" | "admin" | "member";

export interface Org {
  id: string;
  name: string;
  createdAt: number;
  // CAN-SPAM requires a physical postal address in every commercial email.
  postalAddress: string;
  replyToEmail?: string;
}

export interface Member {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  mfaEnrolled: boolean;
  createdAt: number;
}

export type IntegrationProvider = "gmail" | "microsoft";

export interface Integration {
  provider: IntegrationProvider;
  connectedEmail: string; // the mailbox we send from
  connectedByUid: string;
  scopes: string[];
  // refresh token is stored encrypted; never returned to the client
  refreshTokenEnc?: string;
  expiresAt?: number;
  status: "connected" | "error" | "revoked";
  lastError?: string;
  updatedAt: number;
}

export interface Contact {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  // B2B fields for the medical sector
  practiceName?: string;
  specialty?: string;
  city?: string;
  tags: string[];
  /** Custom merge fields keyed by column name from an uploaded CSV. */
  custom: Record<string, string>;
  subscribed: boolean; // false once they unsubscribe — never email these
  source: "upload" | "manual" | "provided";
  createdAt: number;
  updatedAt: number;
}

export interface ContactList {
  id: string;
  name: string;
  description?: string;
  contactIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Template {
  id: string;
  name: string;
  subject: string;
  /** HTML body with {{mergeField}} tokens. */
  body: string;
  createdAt: number;
  updatedAt: number;
}

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "paused"
  | "failed";

/** A file attached to a campaign (stored in Vercel Blob). */
export interface Attachment {
  filename: string;
  contentType: string;
  size: number;
  /** Blob URL to fetch the bytes from at send time. */
  url: string;
}

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  body: string; // HTML with merge tokens
  fromProvider: IntegrationProvider;
  fromEmail: string;
  listId?: string;
  attachments?: Attachment[];
  /** Denormalized counts for the dashboard. */
  stats: {
    total: number;
    sent: number;
    failed: number;
    skipped: number; // unsubscribed / invalid
  };
  status: CampaignStatus;
  scheduledAt?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
}

export type RecipientStatus = "pending" | "sent" | "failed" | "skipped";

export interface Recipient {
  id: string; // contactId
  email: string;
  status: RecipientStatus;
  error?: string;
  providerMessageId?: string;
  sentAt?: number;
}

/** Immutable audit trail — every send and every consent change. */
export interface AuditEvent {
  id: string;
  type:
    | "campaign.sent"
    | "campaign.send_failed"
    | "contact.unsubscribed"
    | "integration.connected"
    | "integration.revoked"
    | "member.invited"
    | "mfa.enrolled";
  actorUid?: string;
  summary: string;
  meta?: Record<string, unknown>;
  createdAt: number;
}
