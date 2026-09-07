"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Image as ImageIcon, Send, Save, Eye, Wand2 } from "lucide-react";

interface Mailbox {
  provider: "gmail" | "microsoft";
  email: string;
}
interface ListSummary {
  id: string;
  name: string;
  count: number;
}

const MERGE_FIELDS = [
  "firstName",
  "lastName",
  "practiceName",
  "specialty",
  "city",
];

const SAMPLE = {
  firstName: "Aisha",
  lastName: "Rahman",
  practiceName: "Bright Smile Dental",
  specialty: "Dentistry",
  city: "Austin",
  email: "reception@brightsmiledental.example",
};

export function Composer({
  mailboxes,
  lists,
  imageEnabled,
}: {
  mailboxes: Mailbox[];
  lists: ListSummary[];
  imageEnabled: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [fromIdx, setFromIdx] = useState(0);
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(
    "<p>Hi {{firstName}},</p>\n<p>Write your message to {{practiceName}} here…</p>"
  );

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const canSend =
    mailboxes.length > 0 && subject.trim() && body.trim() && listId && name.trim();

  function insertToken(token: string) {
    setBody((b) => `${b} {{${token}}}`);
  }

  async function runAi() {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/ai/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, purpose: "both" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.subject) setSubject(data.subject);
      if (data.body) setBody(data.body);
      setMsg("AI draft inserted — review before sending.");
    } catch (err) {
      setMsg(`AI error: ${err}`);
    } finally {
      setAiBusy(false);
    }
  }

  async function generateImage() {
    if (!aiPrompt.trim()) {
      setMsg("Type a short image description in the AI box first.");
      return;
    }
    setImgBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBody((b) => `${b}\n<p><img src="${data.dataUrl}" alt="" style="max-width:100%"/></p>`);
      setMsg("Image added to the body.");
    } catch (err) {
      setMsg(`Image error: ${err}`);
    } finally {
      setImgBusy(false);
    }
  }

  async function save(send: boolean) {
    setSending(true);
    setMsg(null);
    try {
      const mb = mailboxes[fromIdx];
      const createRes = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          subject,
          body,
          fromProvider: mb?.provider,
          fromEmail: mb?.email,
          listId,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error);

      if (!send) {
        router.push(`/campaigns/${created.id}`);
        return;
      }
      const sendRes = await fetch(`/api/campaigns/${created.id}/send`, {
        method: "POST",
      });
      const sent = await sendRes.json();
      if (!sendRes.ok) throw new Error(sent.error);
      router.push(`/campaigns/${created.id}`);
    } catch (err) {
      setMsg(`Failed: ${err}`);
      setSending(false);
    }
  }

  const preview = renderPreview(body, SAMPLE);
  const previewSubject = renderPreview(subject, SAMPLE);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Editor */}
      <div className="space-y-4">
        <div className="card space-y-4">
          <div>
            <label className="label">Campaign name (internal)</label>
            <input
              className="input"
              placeholder="e.g. September dental outreach"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
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
            <div>
              <label className="label">Recipient list</label>
              <select
                className="input"
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
          </div>
        </div>

        <div className="card space-y-4">
          <div>
            <label className="label">Subject</label>
            <input
              className="input"
              placeholder="A note for {{practiceName}}"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="label mb-0">Body (HTML + merge tokens)</label>
              <button
                type="button"
                className="text-xs text-brand-600 hover:underline"
                onClick={() => setShowPreview((s) => !s)}
              >
                <Eye size={12} className="mr-1 inline" />
                {showPreview ? "Hide" : "Show"} preview
              </button>
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              {MERGE_FIELDS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => insertToken(f)}
                  className="badge bg-slate-100 text-slate-600 hover:bg-brand-100 hover:text-brand-700"
                >
                  + {f}
                </button>
              ))}
            </div>
            <textarea
              className="input font-mono text-xs"
              rows={12}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>

        {showPreview && (
          <div className="card">
            <div className="mb-2 text-xs uppercase text-slate-400">
              Preview (sample: {SAMPLE.firstName} @ {SAMPLE.practiceName})
            </div>
            <div className="mb-3 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-800">
              {previewSubject || <span className="text-slate-400">No subject</span>}
            </div>
            <div
              className="prose prose-sm max-w-none text-slate-700"
              dangerouslySetInnerHTML={{ __html: preview }}
            />
            <div className="mt-4 border-t border-slate-100 pt-2 text-xs text-slate-400">
              A compliant footer (your address + unsubscribe link) is added automatically on send.
            </div>
          </div>
        )}

        {msg && (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
            {msg}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button className="btn-secondary" onClick={() => save(false)} disabled={sending || !name.trim()}>
            <Save size={16} /> Save draft
          </button>
          <button className="btn-primary" onClick={() => save(true)} disabled={sending || !canSend}>
            <Send size={16} /> {sending ? "Sending…" : "Send campaign"}
          </button>
        </div>
      </div>

      {/* AI assistant */}
      <div className="space-y-4">
        <div className="card border-brand-100 bg-gradient-to-b from-brand-50/60 to-white">
          <div className="mb-2 flex items-center gap-2">
            <Wand2 size={18} className="text-brand-600" />
            <h2 className="font-semibold text-slate-900">AI assistant</h2>
          </div>
          <p className="mb-3 text-sm text-slate-500">
            Describe what you want to say. Copy is tuned for a professional medical B2B audience.
          </p>
          <textarea
            className="input mb-3"
            rows={4}
            placeholder="e.g. Invite dental practices to a webinar on new patient-scheduling software. Friendly, concise."
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
          />
          <button className="btn-primary mb-2 w-full" onClick={runAi} disabled={aiBusy}>
            <Sparkles size={16} /> {aiBusy ? "Writing…" : "Generate subject + body"}
          </button>
          {imageEnabled && (
            <button className="btn-secondary w-full" onClick={generateImage} disabled={imgBusy}>
              <ImageIcon size={16} /> {imgBusy ? "Creating…" : "Generate an image"}
            </button>
          )}
          <p className="mt-3 text-xs text-slate-400">
            Always review AI output. Never include patient data or unverified clinical claims.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Lightweight client-side token replacement for the live preview only. */
function renderPreview(source: string, ctx: Record<string, string>): string {
  return source.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    if (key.startsWith("custom.")) return "";
    return ctx[key] ?? "";
  });
}
