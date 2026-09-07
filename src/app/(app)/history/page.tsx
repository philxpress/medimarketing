import { requireOrg } from "@/lib/auth/session";
import { getRecentEvents } from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { History as HistoryIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const { orgId } = await requireOrg();
  const events = await getRecentEvents(orgId, 200);

  return (
    <>
      <PageHeader
        title="Email history & audit log"
        description="An immutable record of sends, consent changes, and account events."
      />
      {events.length === 0 ? (
        <div className="card py-14 text-center">
          <HistoryIcon className="mx-auto mb-3 text-neutral-400" size={36} />
          <p className="font-medium text-neutral-900">No activity yet</p>
          <p className="text-sm text-neutral-900">Events will appear here as you use MediReach.</p>
        </div>
      ) : (
        <div className="card p-0">
          <ul className="divide-y divide-slate-50">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-6 py-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-400" />
                <div className="flex-1">
                  <div className="text-sm text-neutral-900">{e.summary}</div>
                  <div className="text-xs text-neutral-900">
                    {new Date(e.createdAt).toLocaleString()} · {e.type}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
