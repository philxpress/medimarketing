import Link from "next/link";
import { Sparkles, Mail } from "lucide-react";
import { requireOrg } from "@/lib/auth/session";
import { getCampaigns } from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const { orgId } = await requireOrg();
  const campaigns = await getCampaigns(orgId);

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Draft, review, and send your email campaigns."
        action={
          <Link href="/campaigns/new" className="btn-primary">
            <Sparkles size={16} /> New campaign
          </Link>
        }
      />

      {campaigns.length === 0 ? (
        <div className="card py-14 text-center">
          <Mail className="mx-auto mb-3 text-neutral-400" size={36} />
          <p className="font-medium text-neutral-900">No campaigns yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-900">
            Compose your first campaign, personalize it with mail merge, and send from your
            connected mailbox.
          </p>
          <Link href="/campaigns/new" className="btn-primary mt-4 inline-flex">
            Create your first campaign
          </Link>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-neutral-900">
              <tr className="border-b border-slate-100">
                <th className="px-6 py-3 font-medium">Campaign</th>
                <th className="px-6 py-3 font-medium">From</th>
                <th className="px-6 py-3 font-medium">Progress</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3">
                    <Link href={`/campaigns/${c.id}`} className="font-medium text-neutral-900 hover:text-brand-600">
                      {c.name}
                    </Link>
                    <div className="max-w-xs truncate text-xs text-neutral-900">{c.subject}</div>
                  </td>
                  <td className="px-6 py-3 text-neutral-900">
                    <span className="capitalize">{c.fromProvider}</span>
                    <div className="text-xs text-neutral-900">{c.fromEmail}</div>
                  </td>
                  <td className="px-6 py-3 text-neutral-900">
                    {c.stats.sent}/{c.stats.total}
                    {c.stats.failed > 0 && (
                      <span className="ml-2 font-medium text-neutral-900">{c.stats.failed} failed</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-6 py-3 text-neutral-900">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
