"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UserProfileForm({
  displayName,
  email,
  role,
}: {
  displayName: string;
  email: string;
  role: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/team/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg("Saved.");
      router.refresh();
    } catch (err) {
      setMsg(`Failed: ${err}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card space-y-4" onSubmit={save}>
      <div>
        <label className="label">Your name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">Email</label>
        <input className="input bg-slate-50" value={email} disabled readOnly />
      </div>
      <div>
        <label className="label">Role</label>
        <input className="input bg-slate-50 capitalize" value={role} disabled readOnly />
      </div>
      {msg && <p className="text-sm text-neutral-900">{msg}</p>}
      <button className="btn-primary" disabled={busy || !name.trim()}>
        {busy ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
