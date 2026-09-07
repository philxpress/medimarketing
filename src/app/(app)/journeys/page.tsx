import Link from "next/link";
import { requireOrg } from "@/lib/auth/session";
import { getIntegrations, getJourneys, getLists } from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { JourneysClient } from "./JourneysClient";

export const dynamic = "force-dynamic";

export default async function JourneysPage() {
  const { orgId, org } = await requireOrg();
  const [journeys, integrations, lists] = await Promise.all([
    getJourneys(orgId),
    getIntegrations(orgId),
    getLists(orgId),
  ]);
  const connected = integrations
    .filter((i) => i.status === "connected")
    .map((i) => ({ provider: i.provider, email: i.connectedEmail }));

  return (
    <>
      <PageHeader
        title="Automations"
        description="Drip sequences that send a series of emails over time. Enroll a list and let it run."
      />
      {!org.postalAddress || connected.length === 0 ? (
        <div className="mb-6 rounded-xl border border-neutral-300 bg-neutral-100 p-4 text-sm text-neutral-900">
          Connect a mailbox and set your postal address in{" "}
          <Link href="/settings" className="font-medium underline">
            Settings
          </Link>{" "}
          before automations can send.
        </div>
      ) : null}

      <JourneysClient
        initialJourneys={journeys.map((j) => ({
          id: j.id,
          name: j.name,
          description: j.description ?? "",
          steps: j.steps.length,
          active: j.active,
          enrolledCount: j.enrolledCount,
        }))}
        mailboxes={connected}
        lists={lists.map((l) => ({ id: l.id, name: l.name, count: l.contactIds.length }))}
      />
    </>
  );
}
