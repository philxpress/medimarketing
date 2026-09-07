import type { CampaignStatus } from "@/lib/types";

const STYLES: Record<CampaignStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  scheduled: "bg-indigo-100 text-indigo-700",
  sending: "bg-blue-100 text-blue-700",
  sent: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className={`badge capitalize ${STYLES[status] ?? STYLES.draft}`}>{status}</span>
  );
}
