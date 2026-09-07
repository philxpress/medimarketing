import Link from "next/link";
import { requireOrg } from "@/lib/auth/session";
import { getIntegrations, getLists } from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { Composer } from "@/components/Composer";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const { orgId, org } = await requireOrg();
  const [integrations, lists] = await Promise.all([
    getIntegrations(orgId),
    getLists(orgId),
  ]);
  const connected = integrations
    .filter((i) => i.status === "connected")
    .map((i) => ({ provider: i.provider, email: i.connectedEmail }));

  const ready = connected.length > 0 && Boolean(org.postalAddress);

  return (
    <>
      <PageHeader title="New campaign" description="Compose, personalize, and send." />

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

      <Composer
        mailboxes={connected}
        lists={lists.map((l) => ({ id: l.id, name: l.name, count: l.contactIds.length }))}
        imageEnabled
      />
    </>
  );
}
