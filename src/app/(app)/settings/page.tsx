import { requireOrg } from "@/lib/auth/session";
import { getIntegrations } from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { OrgProfileForm } from "@/components/settings/OrgProfileForm";
import { IntegrationsPanel } from "@/components/settings/IntegrationsPanel";
import { MfaPanel } from "@/components/settings/MfaPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { orgId, org, member } = await requireOrg();
  const integrations = await getIntegrations(orgId);
  const byProvider = {
    gmail: integrations.find((i) => i.provider === "gmail") ?? null,
    microsoft: integrations.find((i) => i.provider === "microsoft") ?? null,
  };

  return (
    <>
      <PageHeader title="Settings" description="Workspace, mailboxes, and account security." />
      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Connected mailboxes
          </h2>
          <IntegrationsPanel
            gmail={byProvider.gmail && { email: byProvider.gmail.connectedEmail, status: byProvider.gmail.status }}
            microsoft={
              byProvider.microsoft && {
                email: byProvider.microsoft.connectedEmail,
                status: byProvider.microsoft.status,
              }
            }
          />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Account security
          </h2>
          <MfaPanel initialEnrolled={member.mfaEnrolled} email={member.email} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Workspace profile
          </h2>
          <OrgProfileForm
            name={org.name}
            postalAddress={org.postalAddress}
            replyToEmail={org.replyToEmail ?? ""}
            canEdit={member.role !== "member"}
          />
        </section>
      </div>
    </>
  );
}
