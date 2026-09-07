import type { CampaignStatus } from "@/lib/types";

const STYLES: Record<CampaignStatus, string> = {
  draft: "bg-neutral-100 text-neutral-500",
  scheduled: "bg-neutral-200 text-neutral-700",
  sending: "bg-neutral-200 text-neutral-700",
  sent: "bg-neutral-900 text-white",
  paused: "bg-neutral-200 text-neutral-700",
  failed: "bg-white text-neutral-900 ring-1 ring-inset ring-neutral-900",
};

export function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className={`badge capitalize ${STYLES[status] ?? STYLES.draft}`}>{status}</span>
  );
}
