import Link from "next/link";
import {
  Users,
  Mail,
  Send,
  AlertTriangle,
  Plug,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { requireOrg } from "@/lib/auth/session";
import {
  getCampaigns,
  getContacts,
  getIntegrations,
  getRecentEvents,
} from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { orgId, org, member } = await requireOrg();
  const [contacts, campaigns, integrations, events] = await Promise.all([
    getContacts(orgId, 1000),
    getCampaigns(orgId),
    getIntegrations(orgId),
    getRecentEvents(orgId, 8),
  ]);

  const subscribed = contacts.filter((c) => c.subscribed).length;
  const totalSent = campaigns.reduce((n, c) => n + c.stats.sent, 0);
  const totalFailed = campaigns.reduce((n, c) => n + c.stats.failed, 0);
  const connected = integrations.filter((i) => i.status === "connected");

  const needsSetup = !org.postalAddress || connected.length === 0;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${member.displayName?.split(" ")[0] || "there"}`}
        description="Your email marketing at a glance."
        action={
          <Link href="/campaigns/new" className="btn-primary">
            <Sparkles size={16} /> New campaign
          </Link>
        }
      />

      {needsSetup && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-neutral-300 bg-neutral-100 p-4">
          <AlertTriangle className="mt-0.5 shrink-0 text-neutral-700" size={20} />
          <div className="text-sm text-neutral-700">
            <p className="font-medium">Finish setting up before you send</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {!org.postalAddress && (
                <li>
                  Add your postal address in{" "}
                  <Link href="/settings" className="underline">
                    Settings
                  </Link>{" "}
                  (required for compliance).
                </li>
              )}
              {connected.length === 0 && (
                <li>
                  Connect a Gmail or Microsoft mailbox in{" "}
                  <Link href="/settings" className="underline">
                    Settings → Integrations
                  </Link>
                  .
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat icon={Users} label="Subscribed contacts" value={subscribed} />
        <Stat icon={Mail} label="Campaigns" value={campaigns.length} />
        <Stat icon={Send} label="Emails sent" value={totalSent} />
        <Stat icon={AlertTriangle} label="Failed" value={totalFailed} tone={totalFailed ? "warn" : "default"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Recent campaigns</h2>
            <Link href="/campaigns" className="text-sm text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          {campaigns.length === 0 ? (
            <EmptyState
              title="No campaigns yet"
              body="Create your first campaign to start reaching clinics and practices."
              cta={{ href: "/campaigns/new", label: "Create campaign" }}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {campaigns.slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link href={`/campaigns/${c.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                      {c.name}
                    </Link>
                    <div className="text-xs text-slate-400">
                      {c.stats.sent}/{c.stats.total} sent
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 className="mb-4 font-semibold text-slate-900">Connected mailboxes</h2>
          {connected.length === 0 ? (
            <div className="text-sm text-slate-500">
              <Plug className="mb-2 text-slate-300" size={28} />
              No mailbox connected.{" "}
              <Link href="/settings" className="text-brand-600 hover:underline">
                Connect one
              </Link>
              .
            </div>
          ) : (
            <ul className="space-y-2">
              {connected.map((i) => (
                <li key={i.provider} className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full bg-neutral-900" />
                  <span className="capitalize text-slate-600">{i.provider}</span>
                  <span className="truncate text-slate-400">· {i.connectedEmail}</span>
                </li>
              ))}
            </ul>
          )}

          <h2 className="mb-3 mt-6 font-semibold text-slate-900">Activity</h2>
          {events.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className="text-slate-600">
                  <span className="text-slate-400">
                    {new Date(e.createdAt).toLocaleDateString()}
                  </span>{" "}
                  — {e.summary}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: "default" | "warn";
}) {
  return (
    <div className="card p-4">
      <Icon size={20} className={tone === "warn" ? "text-neutral-900" : "text-neutral-500"} />
      <div className="mt-3 text-2xl font-bold text-slate-900">{value.toLocaleString()}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function EmptyState({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="py-8 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{body}</p>
      {cta && (
        <Link href={cta.href} className="btn-primary mt-4 inline-flex">
          {cta.label}
        </Link>
      )}
    </div>
  );
}
