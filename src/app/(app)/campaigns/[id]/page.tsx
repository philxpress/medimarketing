import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Paperclip, MousePointerClick, MailOpen } from "lucide-react";
import { requireOrg } from "@/lib/auth/session";
import { getCampaign, getRecipients } from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { SendButton } from "@/components/SendButton";
import { DuplicateButton } from "@/components/DuplicateButton";
import { formatInTz, DEFAULT_TIMEZONE } from "@/lib/tz";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { orgId, org } = await requireOrg();
  const tz = org.timezone ?? DEFAULT_TIMEZONE;
  const campaign = await getCampaign(orgId, params.id);
  if (!campaign) notFound();
  const recipients =
    campaign.status === "draft" || campaign.status === "scheduled"
      ? []
      : await getRecipients(orgId, params.id);

  const sendable = campaign.status === "draft" || campaign.status === "failed";
  const s = {
    ...campaign.stats,
    opened: campaign.stats.opened ?? 0,
    clicked: campaign.stats.clicked ?? 0,
  };
  const pct = (n: number) => (s.sent > 0 ? Math.round((n / s.sent) * 100) : 0);
  const showAnalytics = campaign.status === "sent" || s.sent > 0;

  return (
    <>
      <Link
        href="/campaigns"
        className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-900 hover:underline"
      >
        <ArrowLeft size={14} /> Back to campaigns
      </Link>
      <PageHeader
        title={campaign.name}
        action={
          <div className="flex items-center gap-3">
            <DuplicateButton campaignId={campaign.id} />
            <StatusBadge status={campaign.status} />
          </div>
        }
      />

      {showAnalytics && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Metric label="Delivered" value={s.sent} sub={`${s.failed} failed`} />
          <Metric
            label="Open rate"
            value={`${pct(s.opened)}%`}
            sub={`${s.opened} opened`}
            icon={<MailOpen size={16} />}
          />
          <Metric
            label="Click rate"
            value={`${pct(s.clicked)}%`}
            sub={`${s.clicked} clicked`}
            icon={<MousePointerClick size={16} />}
          />
          <Metric label="Skipped" value={s.skipped} sub="unsubscribed" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-3 font-semibold text-neutral-900">Email preview</h2>
            <div className="mb-2 text-sm">
              <span className="text-neutral-500">Subject: </span>
              <span className="font-medium text-neutral-900">{campaign.subject}</span>
            </div>
            <div
              className="prose prose-sm max-w-none rounded-lg border border-slate-100 bg-slate-50 p-4 text-neutral-900"
              dangerouslySetInnerHTML={{ __html: campaign.body }}
            />
            {campaign.attachments && campaign.attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {campaign.attachments.map((a) => (
                  <span key={a.url} className="badge bg-slate-100 text-neutral-900">
                    <Paperclip size={11} className="mr-1" /> {a.filename}
                  </span>
                ))}
              </div>
            )}
          </div>

          {recipients.length > 0 && (
            <div className="card p-0">
              <h2 className="border-b border-slate-100 px-6 py-3 font-semibold text-neutral-900">
                Recipients
              </h2>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-slate-50">
                    {recipients.map((r) => (
                      <tr key={r.id}>
                        <td className="px-6 py-2 text-neutral-900">{r.email}</td>
                        <td className="px-6 py-2 text-right text-xs text-neutral-500">
                          {r.openedAt && (
                            <span className="mr-2 inline-flex items-center gap-1">
                              <MailOpen size={12} /> opened
                            </span>
                          )}
                          {r.clickedAt && (
                            <span className="mr-2 inline-flex items-center gap-1">
                              <MousePointerClick size={12} /> clicked
                            </span>
                          )}
                        </td>
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
            <h2 className="mb-4 font-semibold text-neutral-900">Details</h2>
            <dl className="space-y-2 text-sm">
              <Row k="From" v={`${campaign.fromEmail || "—"} (${campaign.fromProvider})`} />
              <Row k="Recipients" v={String(campaign.stats.total)} />
              {campaign.segment && (
                <Row
                  k="Segment"
                  v={
                    [
                      campaign.segment.specialty,
                      campaign.segment.city,
                      campaign.segment.tag,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"
                  }
                />
              )}
              {campaign.scheduledAt && (
                <Row k="Scheduled" v={formatInTz(campaign.scheduledAt, tz)} />
              )}
              <Row k="Created" v={formatInTz(campaign.createdAt, tz)} />
              {campaign.completedAt && (
                <Row k="Completed" v={formatInTz(campaign.completedAt, tz)} />
              )}
            </dl>
          </div>

          {sendable && (
            <div className="card">
              <p className="mb-3 text-sm text-neutral-900">
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

function Metric({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1 text-xs uppercase text-neutral-500">
        {icon} {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-neutral-900">{value}</div>
      {sub && <div className="text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral-500">{k}</dt>
      <dd className="text-right font-medium text-neutral-900">{v}</dd>
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
