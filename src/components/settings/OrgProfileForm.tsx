"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OrgProfileForm({
  name,
  postalAddress,
  replyToEmail,
  canEdit,
}: {
  name: string;
  postalAddress: string;
  replyToEmail: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [n, setN] = useState(name);
  const [addr, setAddr] = useState(postalAddress);
  const [reply, setReply] = useState(replyToEmail);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/org/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, postalAddress: addr, replyToEmail: reply }),
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
        <label className="label">Organization / practice name</label>
        <input className="input" value={n} onChange={(e) => setN(e.target.value)} disabled={!canEdit} />
      </div>
      <div>
        <label className="label">Postal address (shown in email footer)</label>
        <textarea
          className="input"
          rows={2}
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          disabled={!canEdit}
        />
        <p className="mt-1 text-xs text-slate-400">Required by CAN-SPAM in every marketing email.</p>
      </div>
      <div>
        <label className="label">Reply-to email (optional)</label>
        <input
          type="email"
          className="input"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          disabled={!canEdit}
        />
      </div>
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
      {canEdit ? (
        <button className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      ) : (
        <p className="text-sm text-slate-400">Only owners and admins can edit workspace settings.</p>
      )}
    </form>
  );
}
