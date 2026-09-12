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
  /** IANA timezone for scheduling & display (e.g. "Australia/Sydney"). */
  timezone?: string;
}

export interface Member {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  mfaEnrolled: boolean;
  createdAt: number;
}

/** A pending invitation for someone to join an org. Keyed by lowercased email. */
export interface Invite {
  email: string;
  orgId: string;
  orgName: string;
  role: Role;
  invitedByUid: string;
  invitedByName: string;
  status: "pending" | "accepted" | "revoked";
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
  /** Optional filter applied to the list at send time (segmentation). */
  segment?: CampaignSegment;
  /**
   * "Find Prospects" (type-2) targeting: instead of the org's own list, the
   * audience is described by profession + a radius around a postcode and pulled
   * from the prospect database. Persisted for the record even though radius
   * matching activates only once a location-aware database is connected.
   */
  prospecting?: ProspectTarget;
  /**
   * Explicit set of contact IDs to send to, chosen in the wizard's recipient
   * step. When present it is the final send list (list + segment already
   * applied, individual recipients ticked off). When absent, the send falls
   * back to the whole list filtered by `segment` — older campaigns.
   */
  recipientIds?: string[];
  attachments?: Attachment[];
  /** Denormalized counts for the dashboard. */
  stats: {
    total: number;
    sent: number;
    failed: number;
    skipped: number; // unsubscribed / invalid
    opened: number; // unique recipients who opened
    clicked: number; // unique recipients who clicked a link
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
  // Engagement tracking
  openedAt?: number;
  opens?: number;
  clickedAt?: number;
  clicks?: number;
  lastClickedUrl?: string;
}

/** A lightweight segment filter applied to a list at send time. */
export interface CampaignSegment {
  specialty?: string;
  city?: string;
  tag?: string;
}

/** "Find Prospects" targeting — profession + radius around a postcode. */
export interface ProspectTarget {
  profession?: string;
  postcode?: string;
  distanceKm?: number;
}

// ── Automations / journeys ────────────────────────────────────────────

/** One email in a drip sequence, sent after `delayHours` from the prior step. */
export interface JourneyStep {
  delayHours: number;
  subject: string;
  body: string;
}

export interface Journey {
  id: string;
  name: string;
  description?: string;
  fromProvider: IntegrationProvider;
  fromEmail: string;
  steps: JourneyStep[];
  active: boolean;
  enrolledCount: number;
  createdAt: number;
  updatedAt: number;
}

export type EnrollmentStatus = "active" | "completed" | "failed" | "cancelled";

/** A contact progressing through a journey. */
export interface Enrollment {
  id: string; // contactId
  contactId: string;
  email: string;
  currentStep: number; // index of the next step to send
  nextRunAt: number;
  status: EnrollmentStatus;
  startedAt: number;
  updatedAt: number;
  lastError?: string;
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
