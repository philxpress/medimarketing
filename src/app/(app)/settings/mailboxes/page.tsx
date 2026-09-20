import { requireOrg } from "@/lib/auth/session";
import { getIntegrations } from "@/lib/data";
import { IntegrationsPanel } from "@/components/settings/IntegrationsPanel";

export const dynamic = "force-dynamic";

export default async function MailboxesSettingsPage() {
  const { orgId } = await requireOrg();
  const integrations = await getIntegrations(orgId);
  const byProvider = {
    gmail: integrations.find((i) => i.provider === "gmail") ?? null,
    microsoft: integrations.find((i) => i.provider === "microsoft") ?? null,
  };
  const toConn = (i: (typeof integrations)[number] | null) =>
    i && {
      email: i.connectedEmail,
      status: i.status,
      lastError: i.lastError,
      canReadMailbox: Boolean(i.canReadMailbox),
    };
  return (
    <IntegrationsPanel
      gmail={toConn(byProvider.gmail)}
      microsoft={toConn(byProvider.microsoft)}
    />
  );
}
