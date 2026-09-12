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
  return (
    <IntegrationsPanel
      gmail={
        byProvider.gmail && {
          email: byProvider.gmail.connectedEmail,
          status: byProvider.gmail.status,
        }
      }
      microsoft={
        byProvider.microsoft && {
          email: byProvider.microsoft.connectedEmail,
          status: byProvider.microsoft.status,
        }
      }
    />
  );
}
