"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AUSTRALIAN_TIMEZONES, DEFAULT_TIMEZONE, tzAbbrev } from "@/lib/tz";

export function OrgProfileForm({
  name,
  postalAddress,
  replyToEmail,
  timezone,
  canEdit,
}: {
  name: string;
  postalAddress: string;
  replyToEmail: string;
  timezone: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [n, setN] = useState(name);
  const [addr, setAddr] = useState(postalAddress);
  const [reply, setReply] = useState(replyToEmail);
  const [tz, setTz] = useState(timezone || DEFAULT_TIMEZONE);
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
        body: JSON.stringify({ name: n, postalAddress: addr, replyToEmail: reply, timezone: tz }),
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
        <p className="mt-1 text-xs text-neutral-900">Required by CAN-SPAM in every marketing email.</p>
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
      <div>
        <label className="label">Timezone (Australia)</label>
        <select
          className="input"
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          disabled={!canEdit}
        >
          {AUSTRALIAN_TIMEZONES.map((z) => (
            <option key={z.value} value={z.value}>
              {z.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-neutral-500">
          Scheduled campaigns, automations, and displayed times use this timezone. Currently{" "}
          {tzAbbrev(tz)}.
        </p>
      </div>
      {msg && <p className="text-sm text-neutral-900">{msg}</p>}
      {canEdit ? (
        <button className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      ) : (
        <p className="text-sm text-neutral-900">Only owners and admins can edit workspace settings.</p>
      )}
    </form>
  );
}
