import Link from "next/link";
import {
  BarChart3,
  Send,
  MailOpen,
  MousePointerClick,
  MailX,
  UserX,
} from "lucide-react";
import { requireOrg } from "@/lib/auth/session";
import { getCampaigns } from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { formatInTz, DEFAULT_TIMEZONE } from "@/lib/tz";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { orgId, org } = await requireOrg();
  const tz = org.timezone ?? DEFAULT_TIMEZONE;
  const campaigns = await getCampaigns(orgId);

  // Only campaigns that have actually been sent carry engagement outcomes.
  const sentCampaigns = campaigns.filter(
    (c) => c.stats.sent > 0 || c.status === "sent" || c.status === "failed"
  );

  const totals = sentCampaigns.reduce(
    (acc, c) => {
      acc.sent += c.stats.sent;
      acc.opened += c.stats.opened ?? 0;
      acc.clicked += c.stats.clicked ?? 0;
      acc.bounced += c.stats.failed;
      acc.unsubscribed += c.stats.skipped;
      return acc;
    },
    { sent: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 }
  );

  const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

  return (
    <>
      <PageHeader title="Reports" />

      {sentCampaigns.length === 0 ? (
        <div className="card py-14 text-center">
          <BarChart3 className="mx-auto mb-3 text-neutral-400" size={36} />
          <p className="font-medium text-neutral-900">No campaign outcomes yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-900">
            Once you send a campaign, its delivery and engagement results — opens, clicks,
            bounces and unsubscribes — appear here.
          </p>
          <Link href="/campaigns" className="btn-primary mt-4 inline-flex">
            Go to campaigns
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            <Metric label="Emails sent" value={totals.sent} icon={<Send size={16} />} />
            <Metric
              label="Open rate"
              value={`${rate(totals.opened, totals.sent)}%`}
              sub={`${totals.opened} opened`}
              icon={<MailOpen size={16} />}
            />
            <Metric
              label="Click rate"
              value={`${rate(totals.clicked, totals.sent)}%`}
              sub={`${totals.clicked} clicked`}
              icon={<MousePointerClick size={16} />}
            />
            <Metric
              label="Bounced"
              value={totals.bounced}
              sub="failed / rejected"
              icon={<MailX size={16} />}
            />
            <Metric
              label="Unsubscribed"
              value={totals.unsubscribed}
              icon={<UserX size={16} />}
            />
          </div>

          <div className="card overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-neutral-500">
                <tr className="border-b border-slate-100">
                  <th className="px-6 py-3 font-medium">Campaign</th>
                  <th className="px-4 py-3 text-right font-medium">Sent</th>
                  <th className="px-4 py-3 text-right font-medium">Opened</th>
                  <th className="px-4 py-3 text-right font-medium">Clicked</th>
                  <th className="px-4 py-3 text-right font-medium">Bounced</th>
                  <th className="px-4 py-3 text-right font-medium">Unsub.</th>
                  <th className="px-4 py-3 text-right font-medium">Replied</th>
                  <th className="px-6 py-3 font-medium">Sent on</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sentCampaigns.map((c) => {
                  const opened = c.stats.opened ?? 0;
                  const clicked = c.stats.clicked ?? 0;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3">
                        <Link
                          href={`/campaigns/${c.id}`}
                          className="font-medium text-neutral-900 hover:text-brand-600"
                        >
                          {c.name}
                        </Link>
                        <div className="mt-0.5">
                          <StatusBadge status={c.status} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-900">{c.stats.sent}</td>
                      <td className="px-4 py-3 text-right text-neutral-900">
                        {opened}
                        <span className="ml-1 text-xs text-neutral-500">
                          ({rate(opened, c.stats.sent)}%)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-900">
                        {clicked}
                        <span className="ml-1 text-xs text-neutral-500">
                          ({rate(clicked, c.stats.sent)}%)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-900">{c.stats.failed}</td>
                      <td className="px-4 py-3 text-right text-neutral-900">{c.stats.skipped}</td>
                      <td className="px-4 py-3 text-right text-neutral-400">—</td>
                      <td className="px-6 py-3 text-neutral-900">
                        {c.completedAt ? formatInTz(c.completedAt, tz) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-neutral-500">
            Opens and clicks are tracked per recipient via a tracking pixel and link
            redirects. &ldquo;Bounced&rdquo; counts send-time failures and rejections.
            Reply tracking isn&apos;t enabled yet — the Replied column is a placeholder.
          </p>
        </>
      )}
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
