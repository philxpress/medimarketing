"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Image as ImageIcon,
  Send,
  Save,
  Eye,
  Wand2,
  Paperclip,
  FileUp,
  Clock,
  X,
  Mail,
  Filter,
  LayoutTemplate,
} from "lucide-react";
import type { Attachment } from "@/lib/types";

interface Mailbox {
  provider: "gmail" | "microsoft";
  email: string;
}
interface ListSummary {
  id: string;
  name: string;
  count: number;
}
interface TemplateOption {
  id: string;
  name: string;
  subject: string;
  body: string;
}
interface Facets {
  specialties: string[];
  cities: string[];
  tags: string[];
}

const MERGE_FIELDS = ["firstName", "lastName", "practiceName", "specialty", "city"];

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
  templates = [],
  facets = { specialties: [], cities: [], tags: [] },
  imageEnabled,
}: {
  mailboxes: Mailbox[];
  lists: ListSummary[];
  templates?: TemplateOption[];
  facets?: Facets;
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [segment, setSegment] = useState<{ specialty: string; city: string; tag: string }>({
    specialty: "",
    city: "",
    tag: "",
  });
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setBody(t.body);
    setMsg(`Loaded template "${t.name.replace(/^★ /, "")}".`);
  }

  async function saveAsTemplate() {
    const tplName = window.prompt("Template name:", name || "My template");
    if (!tplName) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tplName, subject, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`Saved template "${tplName}".`);
    } catch (err) {
      setMsg(`Couldn't save template: ${err}`);
    } finally {
      setBusy(false);
    }
  }

  const cleanSegment = () => {
    const s: { specialty?: string; city?: string; tag?: string } = {};
    if (segment.specialty) s.specialty = segment.specialty;
    if (segment.city) s.city = segment.city;
    if (segment.tag) s.tag = segment.tag;
    return Object.keys(s).length ? s : undefined;
  };

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const attachRef = useRef<HTMLInputElement>(null);
  const htmlRef = useRef<HTMLInputElement>(null);

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

  async function uploadAttachment(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/attachments/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAttachments((a) => [...a, data as Attachment]);
      setMsg(`Attached ${data.filename}.`);
    } catch (err) {
      setMsg(`Attachment failed: ${err}`);
    } finally {
      setBusy(false);
      if (attachRef.current) attachRef.current.value = "";
    }
  }

  async function importHtml(file: File) {
    const text = await file.text();
    setBody(text);
    setMsg(`Imported ${file.name} as the email body.`);
    if (htmlRef.current) htmlRef.current.value = "";
  }

  async function sendTest() {
    if (!subject.trim() || !body.trim() || mailboxes.length === 0) {
      setMsg("Add a subject, body, and a connected mailbox first.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/campaigns/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          fromProvider: mailboxes[fromIdx].provider,
          attachments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`Test sent to ${data.sentTo}. Check your inbox.`);
    } catch (err) {
      setMsg(`Test failed: ${err}`);
    } finally {
      setBusy(false);
    }
  }

  async function save(mode: "draft" | "send" | "schedule") {
    if (mode === "schedule" && !scheduleAt) {
      setMsg("Pick a date and time to schedule.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const mb = mailboxes[fromIdx];
      const scheduledAt =
        mode === "schedule" ? new Date(scheduleAt).getTime() : undefined;
      if (mode === "schedule" && scheduledAt && scheduledAt <= Date.now()) {
        throw new Error("Scheduled time must be in the future.");
      }

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
          attachments,
          segment: cleanSegment(),
          scheduledAt,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error);

      if (mode === "send") {
        const sendRes = await fetch(`/api/campaigns/${created.id}/send`, { method: "POST" });
        const sent = await sendRes.json();
        if (!sendRes.ok) throw new Error(sent.error);
      }
      router.push(`/campaigns/${created.id}`);
    } catch (err) {
      setMsg(`Failed: ${err}`);
      setBusy(false);
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

          {/* Segmentation: optionally narrow the list */}
          <div>
            <label className="label">
              <Filter size={13} className="mr-1 inline" />
              Segment (optional) — send only to contacts matching:
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              <select
                className="input"
                value={segment.specialty}
                onChange={(e) => setSegment((s) => ({ ...s, specialty: e.target.value }))}
              >
                <option value="">Any specialty</option>
                {facets.specialties.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={segment.city}
                onChange={(e) => setSegment((s) => ({ ...s, city: e.target.value }))}
              >
                <option value="">Any city</option>
                {facets.cities.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={segment.tag}
                onChange={(e) => setSegment((s) => ({ ...s, tag: e.target.value }))}
              >
                <option value="">Any tag</option>
                {facets.tags.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          {templates.length > 0 && (
            <div>
              <label className="label">
                <LayoutTemplate size={13} className="mr-1 inline" />
                Start from a template
              </label>
              <select
                className="input"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) applyTemplate(e.target.value);
                  e.target.value = "";
                }}
              >
                <option value="">Choose a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
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
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-xs text-brand-600 hover:underline"
                  onClick={() => htmlRef.current?.click()}
                >
                  <FileUp size={12} className="mr-1 inline" />
                  Import HTML
                </button>
                <button
                  type="button"
                  className="text-xs text-brand-600 hover:underline"
                  onClick={() => setShowPreview((s) => !s)}
                >
                  <Eye size={12} className="mr-1 inline" />
                  {showPreview ? "Hide" : "Show"} preview
                </button>
              </div>
            </div>
            <input
              ref={htmlRef}
              type="file"
              accept=".html,.htm,text/html"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importHtml(e.target.files[0])}
            />
            <div className="mb-2 flex flex-wrap gap-1">
              {MERGE_FIELDS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => insertToken(f)}
                  className="badge bg-slate-100 text-neutral-900 hover:bg-brand-100 hover:text-brand-700"
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

          {/* Attachments */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="label mb-0">
                <Paperclip size={14} className="mr-1 inline" />
                Attachments
              </label>
              <button
                type="button"
                className="text-xs text-brand-600 hover:underline"
                onClick={() => attachRef.current?.click()}
                disabled={busy}
              >
                + Add file
              </button>
            </div>
            <input
              ref={attachRef}
              type="file"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadAttachment(e.target.files[0])}
            />
            {attachments.length === 0 ? (
              <p className="text-xs text-neutral-500">
                PDF, images, documents — attached to every email in this campaign.
              </p>
            ) : (
              <ul className="space-y-1">
                {attachments.map((a, i) => (
                  <li
                    key={a.url}
                    className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-sm"
                  >
                    <span className="truncate text-neutral-900">
                      {a.filename}{" "}
                      <span className="text-neutral-500">
                        ({Math.max(1, Math.round(a.size / 1024))} KB)
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                      className="text-neutral-500 hover:text-neutral-900"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {showPreview && (
          <div className="card">
            <div className="mb-2 text-xs uppercase text-neutral-500">
              Preview (sample: {SAMPLE.firstName} @ {SAMPLE.practiceName})
            </div>
            <div className="mb-3 border-b border-slate-100 pb-2 text-sm font-semibold text-neutral-900">
              {previewSubject || <span className="text-neutral-400">No subject</span>}
            </div>
            <div
              className="prose prose-sm max-w-none text-neutral-900"
              dangerouslySetInnerHTML={{ __html: preview }}
            />
            {attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-2">
                {attachments.map((a) => (
                  <span key={a.url} className="badge bg-slate-100 text-neutral-900">
                    <Paperclip size={11} className="mr-1" /> {a.filename}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-4 border-t border-slate-100 pt-2 text-xs text-neutral-500">
              A compliant footer (your address + unsubscribe link) is added automatically on send.
            </div>
          </div>
        )}

        {msg && (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-neutral-900">
            {msg}
          </div>
        )}

        {/* Schedule toggle */}
        <div className="card">
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-900">
            <input
              type="checkbox"
              checked={scheduleMode}
              onChange={(e) => setScheduleMode(e.target.checked)}
            />
            <Clock size={15} /> Schedule for later
          </label>
          {scheduleMode && (
            <div className="mt-3">
              <input
                type="datetime-local"
                className="input max-w-xs"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
              />
              <p className="mt-1 text-xs text-neutral-500">
                Processed every ~15 min by a scheduled job. Uses your browser&apos;s timezone.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            className="btn-secondary"
            onClick={() => save("draft")}
            disabled={busy || !name.trim()}
          >
            <Save size={16} /> Save draft
          </button>
          <button className="btn-secondary" onClick={sendTest} disabled={busy}>
            <Mail size={16} /> Send test to me
          </button>
          <button
            className="btn-secondary"
            onClick={saveAsTemplate}
            disabled={busy || !subject.trim() || !body.trim()}
          >
            <LayoutTemplate size={16} /> Save as template
          </button>
          {scheduleMode ? (
            <button
              className="btn-primary"
              onClick={() => save("schedule")}
              disabled={busy || !canSend || !scheduleAt}
            >
              <Clock size={16} /> {busy ? "Scheduling…" : "Schedule send"}
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={() => save("send")}
              disabled={busy || !canSend}
            >
              <Send size={16} /> {busy ? "Sending…" : "Send now"}
            </button>
          )}
        </div>
      </div>

      {/* AI assistant */}
      <div className="space-y-4">
        <div className="card border-brand-100 bg-gradient-to-b from-brand-50/60 to-white">
          <div className="mb-2 flex items-center gap-2">
            <Wand2 size={18} className="text-brand-600" />
            <h2 className="font-semibold text-neutral-900">AI assistant</h2>
          </div>
          <p className="mb-3 text-sm text-neutral-500">
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
          <p className="mt-3 text-xs text-neutral-500">
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
