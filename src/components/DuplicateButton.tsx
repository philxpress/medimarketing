"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";

export function DuplicateButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function duplicate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/campaigns/${data.id}`);
    } catch {
      setBusy(false);
    }
  }

  return (
    <button className="btn-secondary" onClick={duplicate} disabled={busy}>
      <Copy size={15} /> {busy ? "Copying…" : "Duplicate"}
    </button>
  );
}
