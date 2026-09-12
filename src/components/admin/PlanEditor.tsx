"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PlanEditor({ orgId, plan }: { orgId: string; plan: string }) {
  const router = useRouter();
  const [value, setValue] = useState(plan);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/companies/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg("Saved.");
      router.refresh();
    } catch (err) {
      setMsg(`Failed: ${err}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label">Subscription plan</label>
        <input
          className="input w-48"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="trial"
        />
      </div>
      <button className="btn-primary" disabled={busy}>
        {busy ? "Saving…" : "Save plan"}
      </button>
      {msg && <span className="text-sm text-neutral-500">{msg}</span>}
    </form>
  );
}
