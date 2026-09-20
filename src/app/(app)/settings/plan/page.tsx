import { requireOrg } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { getIntegrations } from "@/lib/data";
import { countSuppressions } from "@/lib/email/suppression";
import { planFor, monthKey } from "@/lib/plans";
import { monthlyRemaining } from "@/lib/email/limits";
import { DEFAULT_TIMEZONE } from "@/lib/tz";

export const dynamic = "force-dynamic";

export default async function PlanSettingsPage() {
  const { orgId, org } = await requireOrg();
  const tz = org.timezone ?? DEFAULT_TIMEZONE;
  const plan = planFor(org.plan);

  const [contactCount, integrations, suppressions] = await Promise.all([
    adminDb.collection("orgs").doc(orgId).collection("contacts").count().get(),
    getIntegrations(orgId),
    countSuppressions(orgId),
  ]);
  const contacts = contactCount.data().count;

  const month = monthKey(Date.now(), tz);
  const usedThisMonth = org.sentMonth === month ? org.sentThisMonth ?? 0 : 0;
  const remaining = monthlyRemaining(plan, org.sentThisMonth, org.sentMonth, tz);

  const fmt = (n: number) =>
    n >= Number.MAX_SAFE_INTEGER ? "Unlimited" : n.toLocaleString();

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-neutral-500">Current plan</div>
            <div className="text-2xl font-bold text-neutral-900">{plan.name}</div>
          </div>
          <span className="badge bg-brand-50 text-brand-700">{plan.id}</span>
        </div>
        <p className="mt-2 text-sm text-neutral-500">
          Plan is set by your account administrator. Contact us to change it.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <UsageCard
          label="Emails this month"
          used={usedThisMonth}
          limit={plan.monthlySends}
          sub={`${fmt(remaining)} remaining · resets monthly`}
        />
        <UsageCard
          label="Contacts stored"
          used={contacts}
          limit={plan.maxContacts}
          sub={`${fmt(Math.max(0, plan.maxContacts - contacts))} remaining`}
        />
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold text-neutral-900">Connected mailboxes</h2>
        {integrations.filter((i) => i.status === "connected").length === 0 ? (
          <p className="text-sm text-neutral-500">No connected mailboxes.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {integrations
              .filter((i) => i.status === "connected")
              .map((i) => (
                <li key={i.provider} className="flex justify-between gap-4">
                  <span className="text-neutral-900">
                    {i.connectedEmail}{" "}
                    <span className="text-neutral-500">({i.provider})</span>
                  </span>
                  <span className="text-neutral-500">connected</span>
                </li>
              ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-neutral-500">
          Campaigns send through your own mailbox, so your email provider&apos;s own
          sending limits and anti-spam policies apply — we don&apos;t add a cap on top.
          For very high volumes, use a Google Workspace / Microsoft 365 mailbox rather
          than a personal account.
        </p>
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold text-neutral-900">Suppression list</h2>
        <p className="text-sm text-neutral-500">
          <span className="font-semibold text-neutral-900">{suppressions.toLocaleString()}</span>{" "}
          address{suppressions === 1 ? "" : "es"} are suppressed (hard bounces, complaints
          and manual entries) and are never emailed again.
        </p>
      </div>
    </div>
  );
}

function UsageCard({
  label,
  used,
  limit,
  sub,
}: {
  label: string;
  used: number;
  limit: number;
  sub: string;
}) {
  const unlimited = limit >= Number.MAX_SAFE_INTEGER;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="card">
      <div className="text-xs uppercase text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-neutral-900">
        {used.toLocaleString()}
        {!unlimited && (
          <span className="text-base font-normal text-neutral-500">
            {" "}
            / {limit.toLocaleString()}
          </span>
        )}
      </div>
      {!unlimited && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${pct >= 90 ? "bg-amber-500" : "bg-brand-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <div className="mt-1.5 text-xs text-neutral-500">{sub}</div>
    </div>
  );
}
