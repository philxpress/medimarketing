import Link from "next/link";
import { requireOrg } from "@/lib/auth/session";
import { getContacts, getIntegrations, getLists, getTemplates } from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { CampaignWizard } from "@/components/CampaignWizard";
import { STARTER_TEMPLATES } from "@/lib/starterTemplates";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const { orgId, org } = await requireOrg();
  const [integrations, lists, templates, contacts] = await Promise.all([
    getIntegrations(orgId),
    getLists(orgId),
    getTemplates(orgId),
    getContacts(orgId, 5000),
  ]);
  const connected = integrations
    .filter((i) => i.status === "connected")
    .map((i) => ({ provider: i.provider, email: i.connectedEmail }));

  const ready = connected.length > 0 && Boolean(org.postalAddress);

  // Facets for segmentation (distinct, sorted).
  const distinct = (vals: (string | undefined)[]) =>
    [...new Set(vals.filter((v): v is string => Boolean(v && v.trim())))].sort();
  const facets = {
    specialties: distinct(contacts.map((c) => c.specialty)),
    cities: distinct(contacts.map((c) => c.city)),
    tags: distinct(contacts.flatMap((c) => c.tags ?? [])),
  };

  const templateOptions = [
    ...STARTER_TEMPLATES.map((t) => ({
      id: t.id,
      name: `★ ${t.name}`,
      subject: t.subject,
      body: t.body,
    })),
    ...templates.map((t) => ({ id: t.id, name: t.name, subject: t.subject, body: t.body })),
  ];

  // Lightweight contact projection so the wizard can resolve list membership and
  // let the user search/tick individual recipients (step 5) without a round-trip.
  const contactRows = contacts.map((c) => ({
    id: c.id,
    email: c.email,
    name: [c.firstName, c.lastName].filter(Boolean).join(" ").trim(),
    practiceName: c.practiceName ?? "",
    specialty: c.specialty ?? "",
    city: c.city ?? "",
    tags: c.tags ?? [],
    subscribed: c.subscribed,
  }));

  return (
    <>
      <PageHeader title="New campaign" />

      {!ready && (
        <div className="mb-6 rounded-xl border border-neutral-300 bg-neutral-100 p-4 text-sm text-neutral-900">
          Before sending you need{" "}
          {!org.postalAddress && <span>a postal address</span>}
          {!org.postalAddress && connected.length === 0 && " and "}
          {connected.length === 0 && <span>a connected mailbox</span>}. Add these in{" "}
          <Link href="/settings" className="font-medium underline">
            Settings
          </Link>
          . You can still save a draft.
        </div>
      )}

      <CampaignWizard
        mailboxes={connected}
        lists={lists.map((l) => ({
          id: l.id,
          name: l.name,
          contactIds: l.contactIds,
        }))}
        contacts={contactRows}
        templates={templateOptions}
        facets={facets}
        timezone={org.timezone ?? "Australia/Sydney"}
        imageEnabled
      />
    </>
  );
}
