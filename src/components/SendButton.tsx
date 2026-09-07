"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

export function SendButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.refresh();
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  if (!confirm) {
    return (
      <button className="btn-primary w-full" onClick={() => setConfirm(true)}>
        <Send size={16} /> Send now
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">Send this campaign now?</p>
      {error && <p className="text-sm text-neutral-900">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-secondary flex-1" onClick={() => setConfirm(false)} disabled={busy}>
          Cancel
        </button>
        <button className="btn-primary flex-1" onClick={send} disabled={busy}>
          {busy ? "Sending…" : "Confirm send"}
        </button>
      </div>
    </div>
  );
}
