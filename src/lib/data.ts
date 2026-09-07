/**
 * Server-side Firestore reads/writes via the Admin SDK.
 * Every function is org-scoped; callers pass an orgId obtained from requireOrg().
 */
import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type {
  AuditEvent,
  Campaign,
  Contact,
  ContactList,
  Integration,
  IntegrationProvider,
  Template,
} from "@/lib/types";

const org = (orgId: string) => adminDb.collection("orgs").doc(orgId);

export async function getContacts(orgId: string, limit = 500): Promise<Contact[]> {
  const snap = await org(orgId)
    .collection("contacts")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as Contact);
}

export async function getContactsByIds(
  orgId: string,
  ids: string[]
): Promise<Contact[]> {
  if (ids.length === 0) return [];
  const results: Contact[] = [];
  // Firestore 'in' queries cap at 30 ids; chunk them.
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const snap = await org(orgId)
      .collection("contacts")
      .where("__name__", "in", chunk)
      .get();
    snap.docs.forEach((d) => results.push(d.data() as Contact));
  }
  return results;
}

export async function getLists(orgId: string): Promise<ContactList[]> {
  const snap = await org(orgId).collection("lists").orderBy("updatedAt", "desc").get();
  return snap.docs.map((d) => d.data() as ContactList);
}

export async function getList(orgId: string, listId: string): Promise<ContactList | null> {
  const snap = await org(orgId).collection("lists").doc(listId).get();
  return snap.exists ? (snap.data() as ContactList) : null;
}

export async function getCampaigns(orgId: string): Promise<Campaign[]> {
  const snap = await org(orgId)
    .collection("campaigns")
    .orderBy("createdAt", "desc")
    .get();
  return snap.docs.map((d) => d.data() as Campaign);
}

export async function getCampaign(orgId: string, id: string): Promise<Campaign | null> {
  const snap = await org(orgId).collection("campaigns").doc(id).get();
  return snap.exists ? (snap.data() as Campaign) : null;
}

export async function getRecipients(
  orgId: string,
  campaignId: string,
  limit = 500
): Promise<import("@/lib/types").Recipient[]> {
  const snap = await org(orgId)
    .collection("campaigns")
    .doc(campaignId)
    .collection("recipients")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as import("@/lib/types").Recipient);
}

export async function getTemplates(orgId: string): Promise<Template[]> {
  const snap = await org(orgId).collection("templates").orderBy("updatedAt", "desc").get();
  return snap.docs.map((d) => d.data() as Template);
}

export async function getIntegrations(orgId: string): Promise<Integration[]> {
  const snap = await org(orgId).collection("integrations").get();
  return snap.docs.map((d) => {
    const data = d.data() as Integration;
    // Never leak the encrypted refresh token to callers/pages.
    return { ...data, refreshTokenEnc: undefined };
  });
}

export async function getIntegrationRaw(
  orgId: string,
  provider: IntegrationProvider
): Promise<Integration | null> {
  const snap = await org(orgId).collection("integrations").doc(provider).get();
  return snap.exists ? (snap.data() as Integration) : null;
}

export async function getRecentEvents(orgId: string, limit = 50): Promise<AuditEvent[]> {
  const snap = await org(orgId)
    .collection("events")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as AuditEvent);
}

export async function logEvent(
  orgId: string,
  event: Omit<AuditEvent, "id" | "createdAt">
): Promise<void> {
  const ref = org(orgId).collection("events").doc();
  await ref.set({ ...event, id: ref.id, createdAt: Date.now() });
}
