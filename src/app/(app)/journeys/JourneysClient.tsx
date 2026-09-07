"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Play, Pause, Users, X, GitBranch } from "lucide-react";

interface Mailbox {
  provider: "gmail" | "microsoft";
  email: string;
}
interface ListSummary {
  id: string;
  name: string;
  count: number;
}
interface JourneySummary {
  id: string;
  name: string;
  description: string;
  steps: number;
  active: boolean;
  enrolledCount: number;
}
interface StepForm {
  delayHours: number;
  subject: string;
  body: string;
}

export function JourneysClient({
  initialJourneys,
  mailboxes,
  lists,
}: {
  initialJourneys: JourneySummary[];
  mailboxes: Mailbox[];
  lists: ListSummary[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {msg && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-neutral-900">
          {msg}
        </div>
      )}

      <div className="flex justify-end">
        {!creating && (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> New automation
          </button>
        )}
      </div>

      {creating && (
        <CreateJourney
          mailboxes={mailboxes}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setMsg("Automation created. Activate it, then enroll a list.");
            router.refresh();
          }}
        />
      )}

      {initialJourneys.length === 0 && !creating ? (
        <div className="card py-14 text-center">
          <GitBranch className="mx-auto mb-3 text-neutral-300" size={36} />
          <p className="font-medium text-neutral-900">No automations yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">
            Build a sequence — e.g. a welcome email now, a follow-up in 3 days, a check-in in a
            week — and enroll a list. Emails send automatically over time.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {initialJourneys.map((j) => (
            <JourneyRow
              key={j.id}
              journey={j}
              lists={lists}
              onChanged={(m) => {
                if (m) setMsg(m);
                router.refresh();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function JourneyRow({
  journey,
  lists,
  onChanged,
}: {
  journey: JourneySummary;
  lists: ListSummary[];
  onChanged: (msg?: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [listId, setListId] = useState(lists[0]?.id ?? "");

  async function toggleActive() {
    setBusy(true);
    await fetch(`/api/journeys/${journey.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !journey.active }),
    });
    setBusy(false);
    onChanged(journey.active ? "Automation paused." : "Automation activated.");
  }

  async function remove() {
    if (!window.confirm(`Delete "${journey.name}"? Enrolled contacts stop receiving it.`)) return;
    setBusy(true);
    await fetch(`/api/journeys/${journey.id}`, { method: "DELETE" });
    setBusy(false);
    onChanged("Automation deleted.");
  }

  async function enroll() {
    if (!listId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/journeys/${journey.id}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onChanged(`Enrolled ${data.enrolled} contacts.`);
    } catch (err) {
      onChanged(`Enroll failed: ${err}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-neutral-900">{journey.name}</h3>
            {journey.active ? (
              <span className="badge bg-neutral-900 text-white">Active</span>
            ) : (
              <span className="badge bg-neutral-100 text-neutral-500">Paused</span>
            )}
          </div>
          {journey.description && (
            <p className="mt-0.5 text-sm text-neutral-500">{journey.description}</p>
          )}
          <p className="mt-1 text-xs text-neutral-500">
            {journey.steps} step{journey.steps === 1 ? "" : "s"} ·{" "}
            <Users size={11} className="inline" /> {journey.enrolledCount} enrolled
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={toggleActive} disabled={busy}>
            {journey.active ? (
              <>
                <Pause size={15} /> Pause
              </>
            ) : (
              <>
                <Play size={15} /> Activate
              </>
            )}
          </button>
          <button className="btn-secondary" onClick={remove} disabled={busy}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
        <div>
          <label className="label">Enroll a list</label>
          <select
            className="input w-56"
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            disabled={lists.length === 0}
          >
            {lists.length === 0 ? (
              <option value="">No lists yet</option>
            ) : (
              lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.count})
                </option>
              ))
            )}
          </select>
        </div>
        <button
          className="btn-primary"
          onClick={enroll}
          disabled={busy || !journey.active || !listId}
          title={!journey.active ? "Activate the automation first" : undefined}
        >
          <Users size={15} /> Enroll
        </button>
      </div>
    </div>
  );
}

function CreateJourney({
  mailboxes,
  onCancel,
  onCreated,
}: {
  mailboxes: Mailbox[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fromIdx, setFromIdx] = useState(0);
  const [steps, setSteps] = useState<StepForm[]>([
    { delayHours: 0, subject: "", body: "<p>Hi {{firstName}},</p>\n<p>…</p>" },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setStep(i: number, patch: Partial<StepForm>) {
    setSteps((arr) => arr.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      if (mailboxes.length === 0) throw new Error("Connect a mailbox first.");
      const mb = mailboxes[fromIdx];
      const res = await fetch("/api/journeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          fromProvider: mb.provider,
          fromEmail: mb.email,
          steps,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreated();
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-neutral-900">New automation</h2>
        <button onClick={onCancel} className="text-neutral-500 hover:text-neutral-900">
          <X size={18} />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            placeholder="e.g. New-lead welcome series"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Send from</label>
          <select
            className="input"
            value={fromIdx}
            onChange={(e) => setFromIdx(Number(e.target.value))}
            disabled={mailboxes.length === 0}
          >
            {mailboxes.length === 0 ? (
              <option>No mailbox connected</option>
            ) : (
              mailboxes.map((m, i) => (
                <option key={m.email} value={i}>
                  {m.email} ({m.provider})
                </option>
              ))
            )}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Description (optional)</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="space-y-3">
        <label className="label mb-0">Steps</label>
        {steps.map((s, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-900">Step {i + 1}</span>
              {steps.length > 1 && (
                <button
                  className="text-neutral-500 hover:text-neutral-900"
                  onClick={() => setSteps((arr) => arr.filter((_, j) => j !== i))}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <div className="mb-2 flex items-center gap-2 text-sm">
              <span className="text-neutral-500">
                {i === 0 ? "Send after" : "Then wait"}
              </span>
              <input
                type="number"
                min={0}
                className="input w-24"
                value={s.delayHours}
                onChange={(e) => setStep(i, { delayHours: Number(e.target.value) })}
              />
              <span className="text-neutral-500">hours</span>
            </div>
            <input
              className="input mb-2"
              placeholder="Subject (supports {{firstName}} etc.)"
              value={s.subject}
              onChange={(e) => setStep(i, { subject: e.target.value })}
            />
            <textarea
              className="input font-mono text-xs"
              rows={4}
              value={s.body}
              onChange={(e) => setStep(i, { body: e.target.value })}
            />
          </div>
        ))}
        <button
          className="btn-secondary"
          onClick={() =>
            setSteps((arr) => [
              ...arr,
              { delayHours: 72, subject: "", body: "<p>Hi {{firstName}},</p>\n<p>…</p>" },
            ])
          }
        >
          <Plus size={15} /> Add step
        </button>
      </div>

      {err && <p className="text-sm text-neutral-900">{err}</p>}
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn-primary"
          onClick={create}
          disabled={busy || !name.trim() || steps.some((s) => !s.subject.trim() || !s.body.trim())}
        >
          {busy ? "Creating…" : "Create automation"}
        </button>
      </div>
    </div>
  );
}
