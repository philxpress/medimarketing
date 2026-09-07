import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrg } from "@/lib/auth/session";
import { getCampaign, getRecipients } from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { SendButton } from "@/components/SendButton";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { orgId } = await requireOrg();
  const campaign = await getCampaign(orgId, params.id);
  if (!campaign) notFound();
  const recipients =
    campaign.status === "draft" ? [] : await getRecipients(orgId, params.id);

  const sendable = campaign.status === "draft" || campaign.status === "failed";

  return (
    <>
      <Link href="/campaigns" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} /> Back to campaigns
      </Link>
      <PageHeader
        title={campaign.name}
        description={campaign.subject}
        action={<StatusBadge status={campaign.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-3 font-semibold text-slate-900">Email preview</h2>
            <div className="mb-2 text-sm">
              <span className="text-slate-400">Subject: </span>
              <span className="font-medium text-slate-800">{campaign.subject}</span>
            </div>
            <div
              className="prose prose-sm max-w-none rounded-lg border border-slate-100 bg-slate-50 p-4 text-slate-700"
              dangerouslySetInnerHTML={{ __html: campaign.body }}
            />
          </div>

          {recipients.length > 0 && (
            <div className="card p-0">
              <h2 className="border-b border-slate-100 px-6 py-3 font-semibold text-slate-900">
                Recipients
              </h2>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-slate-50">
                    {recipients.map((r) => (
                      <tr key={r.id}>
                        <td className="px-6 py-2 text-slate-600">{r.email}</td>
                        <td className="px-6 py-2 text-right">
                          <RecipientBadge status={r.status} error={r.error} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card">
            <h2 className="mb-4 font-semibold text-slate-900">Details</h2>
            <dl className="space-y-2 text-sm">
              <Row k="From" v={`${campaign.fromEmail || "—"} (${campaign.fromProvider})`} />
              <Row k="Recipients" v={String(campaign.stats.total)} />
              <Row k="Sent" v={String(campaign.stats.sent)} />
              <Row k="Failed" v={String(campaign.stats.failed)} />
              <Row k="Skipped" v={String(campaign.stats.skipped)} />
              <Row k="Created" v={new Date(campaign.createdAt).toLocaleString()} />
              {campaign.completedAt && (
                <Row k="Completed" v={new Date(campaign.completedAt).toLocaleString()} />
              )}
            </dl>
          </div>

          {sendable && (
            <div className="card">
              <p className="mb-3 text-sm text-slate-500">
                Ready to send to {campaign.stats.total} recipient
                {campaign.stats.total === 1 ? "" : "s"}? Unsubscribed contacts are skipped
                automatically.
              </p>
              <SendButton campaignId={campaign.id} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-400">{k}</dt>
      <dd className="text-right font-medium text-slate-700">{v}</dd>
    </div>
  );
}

function RecipientBadge({ status, error }: { status: string; error?: string }) {
  const map: Record<string, string> = {
    sent: "bg-neutral-900 text-white",
    failed: "bg-white text-neutral-900 ring-1 ring-inset ring-neutral-900",
    skipped: "bg-neutral-100 text-neutral-500",
    pending: "bg-neutral-200 text-neutral-700",
  };
  return (
    <span className={`badge ${map[status] ?? map.pending}`} title={error}>
      {status}
    </span>
  );
}
