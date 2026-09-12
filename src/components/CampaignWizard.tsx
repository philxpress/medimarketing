"use client";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Image as ImageIcon,
  Send,
  Save,
  Wand2,
  Paperclip,
  FileUp,
  Clock,
  X,
  Mail,
  Filter,
  LayoutTemplate,
  Search,
  Check,
  ChevronLeft,
  ChevronRight,
  Users,
  ListChecks,
  Target,
  MapPin,
} from "lucide-react";
import type { Attachment } from "@/lib/types";
import { zonedTimeToEpoch, tzAbbrev } from "@/lib/tz";

interface Mailbox {
  provider: "gmail" | "microsoft";
  email: string;
}
interface ListSummary {
  id: string;
  name: string;
  contactIds: string[];
}
interface WizardContact {
  id: string;
  email: string;
  name: string;
  practiceName: string;
  specialty: string;
  city: string;
  tags: string[];
  subscribed: boolean;
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

type CampaignType = "" | "list" | "prospect";

const MERGE_FIELDS = ["firstName", "lastName", "practiceName", "specialty", "city"];
const DISTANCES = [5, 10, 20, 50, 100];

const SAMPLE = {
  firstName: "Aisha",
  lastName: "Rahman",
  practiceName: "Bright Smile Dental",
  specialty: "Dentistry",
  city: "Austin",
  email: "reception@brightsmiledental.example",
};

const STEPS = [
  { n: 1, title: "Campaign type" },
  { n: 2, title: "Name & sender" },
  { n: 3, title: "Audience" },
  { n: 4, title: "Template" },
  { n: 5, title: "Preview content" },
  { n: 6, title: "Recipients" },
  { n: 7, title: "Send" },
] as const;

export function CampaignWizard({
  mailboxes,
  lists,
  contacts,
  templates = [],
  facets = { specialties: [], cities: [], tags: [] },
  timezone = "Australia/Sydney",
  imageEnabled,
}: {
  mailboxes: Mailbox[];
  lists: ListSummary[];
  contacts: WizardContact[];
  templates?: TemplateOption[];
  facets?: Facets;
  timezone?: string;
  imageEnabled: boolean;
}) {
  const router = useRouter();

  const [step, setStep] = useState(1);

  // Step 1
  const [campaignType, setCampaignType] = useState<CampaignType>("");

  // Step 2
  const [name, setName] = useState("");
  const [fromIdx, setFromIdx] = useState(0);

  // Step 3 — My List
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [segment, setSegment] = useState<{ specialty: string; city: string; tag: string }>({
    specialty: "",
    city: "",
    tag: "",
  });
  // Step 3 — Find Prospects
  const [profession, setProfession] = useState("");
  const [postcode, setPostcode] = useState("");
  const [distanceKm, setDistanceKm] = useState(20);

  // Step 4
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(
    "<p>Hi {{firstName}},</p>\n<p>Write your message to {{practiceName}} here…</p>"
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Step 6 — individual recipient selection (track exclusions).
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Step 7
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const attachRef = useRef<HTMLInputElement>(null);
  const htmlRef = useRef<HTMLInputElement>(null);

  const contactsById = useMemo(
    () => new Map(contacts.map((c) => [c.id, c])),
    [contacts]
  );

  // The audience pool shown in the recipients step, resolved from the chosen
  // campaign type.
  const baseRecipients = useMemo(() => {
    if (campaignType === "prospect") {
      if (!profession) return [] as WizardContact[];
      // Prospects are matched by profession from the available contact database.
      // Radius-around-postcode filtering activates once location data exists.
      return contacts.filter((c) => c.subscribed && c.specialty === profession);
    }
    if (campaignType === "list") {
      const list = lists.find((l) => l.id === listId);
      if (!list) return [] as WizardContact[];
      return list.contactIds
        .map((id) => contactsById.get(id))
        .filter((c): c is WizardContact => Boolean(c && c.subscribed))
        .filter((c) => {
          if (segment.specialty && c.specialty !== segment.specialty) return false;
          if (segment.city && c.city !== segment.city) return false;
          if (segment.tag && !c.tags.includes(segment.tag)) return false;
          return true;
        });
    }
    return [] as WizardContact[];
  }, [campaignType, profession, contacts, lists, listId, contactsById, segment]);

  const selectedIds = useMemo(
    () => baseRecipients.filter((c) => !excluded.has(c.id)).map((c) => c.id),
    [baseRecipients, excluded]
  );
  const selectedCount = selectedIds.length;

  const filteredRecipients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return baseRecipients;
    return baseRecipients.filter((c) =>
      [c.name, c.email, c.practiceName, c.specialty, c.city]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [baseRecipients, search]);

  const mb = mailboxes[fromIdx];

  function toggleExcluded(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const selectAll = () => setExcluded(new Set());
  const selectNone = () => setExcluded(new Set(baseRecipients.map((c) => c.id)));

  function chooseType(t: CampaignType) {
    setCampaignType(t);
    setExcluded(new Set()); // reset any prior selection when switching source
  }

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setBody(t.body);
    setMsg(`Loaded template "${t.name.replace(/^★ /, "")}".`);
  }

  function insertToken(token: string) {
    setBody((b) => `${b} {{${token}}}`);
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
          fromProvider: mb.provider,
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

  const cleanSegment = () => {
    if (campaignType !== "list") return undefined;
    const s: { specialty?: string; city?: string; tag?: string } = {};
    if (segment.specialty) s.specialty = segment.specialty;
    if (segment.city) s.city = segment.city;
    if (segment.tag) s.tag = segment.tag;
    return Object.keys(s).length ? s : undefined;
  };

  const cleanProspecting = () => {
    if (campaignType !== "prospect") return undefined;
    const p: { profession?: string; postcode?: string; distanceKm?: number } = {};
    if (profession) p.profession = profession;
    if (postcode.trim()) p.postcode = postcode.trim();
    if (distanceKm) p.distanceKm = distanceKm;
    return Object.keys(p).length ? p : undefined;
  };

  async function save(mode: "draft" | "send" | "schedule") {
    if (mode === "schedule" && !scheduleAt) {
      setMsg("Pick a date and time to schedule.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const scheduledAt =
        mode === "schedule" ? zonedTimeToEpoch(scheduleAt, timezone) : undefined;
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
          listId: campaignType === "list" ? listId : undefined,
          attachments,
          segment: cleanSegment(),
          prospecting: cleanProspecting(),
          recipientIds: selectedIds,
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

  // Per-step gating for the Next button.
  const canProceed = (() => {
    switch (step) {
      case 1:
        return campaignType !== "";
      case 2:
        return Boolean(name.trim()) && mailboxes.length > 0;
      case 3:
        return campaignType === "prospect"
          ? Boolean(profession) && baseRecipients.length > 0
          : Boolean(listId) && baseRecipients.length > 0;
      case 4:
        return Boolean(subject.trim()) && Boolean(body.trim());
      case 5:
        return true;
      case 6:
        return selectedCount > 0;
      default:
        return true;
    }
  })();

  const audienceReady =
    campaignType === "prospect" ? Boolean(profession) : Boolean(listId);
  const canSend =
    mailboxes.length > 0 &&
    subject.trim() &&
    body.trim() &&
    name.trim() &&
    audienceReady &&
    selectedCount > 0;

  const preview = renderPreview(body, SAMPLE);
  const previewSubject = renderPreview(subject, SAMPLE);
  const chosenList = lists.find((l) => l.id === listId);

  return (
    <div className="mx-auto max-w-4xl">
      {/* Stepper */}
      <ol className="mb-6 flex flex-wrap items-center gap-y-2">
        {STEPS.map((s, i) => {
          const state = s.n === step ? "current" : s.n < step ? "done" : "todo";
          return (
            <li key={s.n} className="flex items-center">
              <button
                type="button"
                onClick={() => s.n < step && setStep(s.n)}
                disabled={s.n > step}
                className={`flex items-center gap-2 ${
                  s.n < step ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    state === "current"
                      ? "bg-brand-600 text-white"
                      : state === "done"
                        ? "bg-brand-100 text-brand-700"
                        : "bg-slate-100 text-neutral-500"
                  }`}
                >
                  {state === "done" ? <Check size={14} /> : s.n}
                </span>
                <span
                  className={`hidden text-sm sm:inline ${
                    state === "current"
                      ? "font-semibold text-neutral-900"
                      : "text-neutral-500"
                  }`}
                >
                  {s.title}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span className="mx-2 h-px w-4 bg-slate-200 sm:w-6" />
              )}
            </li>
          );
        })}
      </ol>

      {/* ── Step 1 — campaign type ─────────────────────────────── */}
      {step === 1 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TypeCard
            active={campaignType === "list"}
            onClick={() => chooseType("list")}
            icon={<ListChecks size={22} />}
            title="My List"
            desc="Send to contacts you've uploaded or added — your own lists, narrowed by segment."
          />
          <TypeCard
            active={campaignType === "prospect"}
            onClick={() => chooseType("prospect")}
            icon={<Target size={22} />}
            title="Find Prospects"
            desc="Describe who to reach — a profession within a distance of a postcode — and pull matching contacts from the database."
          />
        </div>
      )}

      {/* ── Step 2 — name & sender ─────────────────────────────── */}
      {step === 2 && (
        <div className="card space-y-4">
          <div>
            <label className="label">Campaign name (internal)</label>
            <input
              className="input"
              placeholder="e.g. September dental outreach"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
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
            {mailboxes.length === 0 && (
              <p className="mt-1 text-xs text-neutral-500">
                Connect a Gmail or Microsoft mailbox in Settings to send.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Step 3 — audience ──────────────────────────────────── */}
      {step === 3 && campaignType === "list" && (
        <div className="card space-y-4">
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
                    {l.name} ({l.contactIds.length})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="label">
              <Filter size={13} className="mr-1 inline" />
              Segment (optional) — only contacts matching:
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

          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-neutral-900">
            <Users size={14} className="mr-1 inline" />
            {chosenList ? (
              <>
                <span className="font-semibold">{baseRecipients.length}</span> subscribed
                contact{baseRecipients.length === 1 ? "" : "s"} match in{" "}
                <span className="font-medium">{chosenList.name}</span>. Fine-tune exactly who
                gets this in step 6.
              </>
            ) : (
              "Choose a list to see how many contacts it holds."
            )}
          </div>
        </div>
      )}

      {step === 3 && campaignType === "prospect" && (
        <div className="card space-y-4">
          <div>
            <label className="label">
              <Target size={13} className="mr-1 inline" />
              Profession
            </label>
            <select
              className="input"
              value={profession}
              onChange={(e) => setProfession(e.target.value)}
            >
              <option value="">Choose a profession…</option>
              {facets.specialties.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">
                <MapPin size={13} className="mr-1 inline" />
                Postcode
              </label>
              <input
                className="input"
                inputMode="numeric"
                placeholder="e.g. 3000"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Distance</label>
              <select
                className="input"
                value={distanceKm}
                onChange={(e) => setDistanceKm(Number(e.target.value))}
              >
                {DISTANCES.map((d) => (
                  <option key={d} value={d}>
                    Within {d} km
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-neutral-900">
            <Users size={14} className="mr-1 inline" />
            {profession ? (
              <>
                <span className="font-semibold">{baseRecipients.length}</span> matching{" "}
                <span className="font-medium">{profession}</span> contact
                {baseRecipients.length === 1 ? "" : "s"} found.
              </>
            ) : (
              "Choose a profession to find matching prospects."
            )}
          </div>

          <p className="text-xs text-neutral-500">
            Prospects are matched by profession from the contact database. Postcode-radius
            filtering ({postcode ? `within ${distanceKm} km of ${postcode}` : "postcode + distance"})
            is captured now and applied once a location-aware prospect database is connected.
          </p>
        </div>
      )}

      {/* ── Step 4 — template & content ────────────────────────── */}
      {step === 4 && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="card space-y-4">
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
                  <option value="">Blank — write from scratch</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
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
                    onClick={() => htmlRef.current?.click()}
                  >
                    <FileUp size={12} className="mr-1 inline" />
                    Import HTML
                  </button>
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

              <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={saveAsTemplate}
                  disabled={busy || !subject.trim() || !body.trim()}
                >
                  <LayoutTemplate size={16} /> Save as template
                </button>
              </div>
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
                Describe what you want to say. Copy is tuned for a professional medical B2B
                audience.
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
                <button
                  className="btn-secondary w-full"
                  onClick={generateImage}
                  disabled={imgBusy}
                >
                  <ImageIcon size={16} /> {imgBusy ? "Creating…" : "Generate an image"}
                </button>
              )}
              <p className="mt-3 text-xs text-neutral-500">
                Always review AI output. Never include patient data or unverified clinical
                claims.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 5 — preview content ───────────────────────────── */}
      {step === 5 && (
        <div className="card">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs uppercase text-neutral-500">
              Preview (sample: {SAMPLE.firstName} @ {SAMPLE.practiceName})
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={sendTest}
              disabled={busy}
            >
              <Mail size={16} /> Send test to me
            </button>
          </div>
          <div className="mb-3 border-b border-slate-100 pb-2 text-sm">
            <span className="text-neutral-500">Subject: </span>
            <span className="font-semibold text-neutral-900">
              {previewSubject || <span className="text-neutral-400">No subject</span>}
            </span>
          </div>
          <div
            className="prose prose-sm max-w-none rounded-lg border border-slate-100 bg-slate-50 p-4 text-neutral-900"
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
            A compliant footer (your address + unsubscribe link) is added automatically on
            send. Open &amp; click tracking is injected per recipient.
          </div>
        </div>
      )}

      {/* ── Step 6 — recipient selection ───────────────────────── */}
      {step === 6 && (
        <div className="card p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
            <div className="text-sm text-neutral-900">
              <span className="font-semibold">{selectedCount}</span> of{" "}
              {baseRecipients.length} selected
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                className="text-brand-600 hover:underline"
                onClick={selectAll}
              >
                Select all
              </button>
              <button
                type="button"
                className="text-brand-600 hover:underline"
                onClick={selectNone}
              >
                Clear all
              </button>
            </div>
          </div>
          <div className="border-b border-slate-100 px-5 py-3">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
              />
              <input
                className="input pl-8"
                placeholder="Search by name, email, practice, city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            {filteredRecipients.length === 0 ? (
              <p className="px-5 py-6 text-sm text-neutral-500">
                {baseRecipients.length === 0
                  ? "No subscribed contacts match this audience."
                  : "No contacts match your search."}
              </p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {filteredRecipients.map((c) => {
                  const on = !excluded.has(c.id);
                  return (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-5 py-2.5 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-brand-600"
                          checked={on}
                          onChange={() => toggleExcluded(c.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-neutral-900">
                            {c.name || c.email}
                          </span>
                          <span className="block truncate text-xs text-neutral-500">
                            {c.email}
                            {c.practiceName ? ` · ${c.practiceName}` : ""}
                            {c.city ? ` · ${c.city}` : ""}
                          </span>
                        </span>
                        {c.specialty && (
                          <span className="badge hidden bg-slate-100 text-neutral-700 sm:inline-flex">
                            {c.specialty}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ── Step 7 — review & send ─────────────────────────────── */}
      {step === 7 && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="mb-3 font-semibold text-neutral-900">Review</h2>
            <dl className="space-y-2 text-sm">
              <Row k="Type" v={campaignType === "prospect" ? "Find Prospects" : "My List"} />
              <Row k="Campaign" v={name || "—"} />
              <Row k="From" v={mb ? `${mb.email} (${mb.provider})` : "—"} />
              {campaignType === "prospect" ? (
                <Row
                  k="Audience"
                  v={
                    [
                      profession,
                      postcode ? `within ${distanceKm} km of ${postcode}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"
                  }
                />
              ) : (
                <>
                  <Row k="List" v={chosenList?.name ?? "—"} />
                  {cleanSegment() && (
                    <Row
                      k="Segment"
                      v={[segment.specialty, segment.city, segment.tag]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                  )}
                </>
              )}
              <Row k="Recipients" v={`${selectedCount} selected`} />
              <Row k="Subject" v={subject || "—"} />
              {attachments.length > 0 && (
                <Row k="Attachments" v={`${attachments.length} file(s)`} />
              )}
            </dl>
          </div>

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
                  Interpreted in your workspace timezone ({tzAbbrev(timezone)}). Change it in
                  Settings. Processing runs daily on the free plan (see Settings).
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
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
                <Send size={16} /> {busy ? "Sending…" : `Send to ${selectedCount}`}
              </button>
            )}
          </div>
        </div>
      )}

      {msg && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-neutral-900">
          {msg}
        </div>
      )}

      {/* Footer nav */}
      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
        >
          <ChevronLeft size={16} /> Back
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => save("draft")}
            disabled={busy || !name.trim() || campaignType === ""}
          >
            <Save size={16} /> Save draft
          </button>
          {step < STEPS.length && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => canProceed && setStep((s) => Math.min(STEPS.length, s + 1))}
              disabled={!canProceed}
            >
              Next <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TypeCard({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card flex h-full flex-col items-start gap-2 text-left transition ${
        active
          ? "ring-2 ring-brand-500"
          : "hover:border-brand-200 hover:shadow-md"
      }`}
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-lg ${
          active ? "bg-brand-600 text-white" : "bg-slate-100 text-neutral-900"
        }`}
      >
        {icon}
      </span>
      <span className="flex items-center gap-2 text-base font-semibold text-neutral-900">
        {title}
        {active && <Check size={16} className="text-brand-600" />}
      </span>
      <span className="text-sm text-neutral-500">{desc}</span>
    </button>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral-500">{k}</dt>
      <dd className="text-right font-medium text-neutral-900">{v}</dd>
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
