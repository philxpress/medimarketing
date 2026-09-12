"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, ListChecks, Search, UserPlus, X, Trash2, Download } from "lucide-react";
import type { Contact } from "@/lib/types";

interface ListSummary {
  id: string;
  name: string;
  count: number;
}

type EditTarget = Contact | "new" | null;

export function ContactsClient({
  initialContacts,
  lists,
}: {
  initialContacts: Contact[];
  lists: ListSummary[];
}) {
  const router = useRouter();
  const [contacts] = useState(initialContacts);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditTarget>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [listName, setListName] = useState("");

  const filtered = contacts.filter((c) => {
    const q = query.toLowerCase();
    return (
      !q ||
      c.email.toLowerCase().includes(q) ||
      `${c.firstName ?? ""} ${c.lastName ?? ""}`.toLowerCase().includes(q) ||
      (c.practiceName ?? "").toLowerCase().includes(q) ||
      (c.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  });

  async function handleFile(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const csv = await file.text();
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, listName: listName.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`Imported ${data.imported} contacts (${data.skipped} skipped).`);
      router.refresh();
    } catch (err) {
      setMsg(`Import failed: ${err}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }


  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center gap-2">
            <Upload size={18} className="text-neutral-900" />
            <h2 className="font-semibold text-neutral-900">Upload a CSV</h2>
          </div>
          <a
            href="/contacts-template.csv"
            download="medireach-contacts-template.csv"
            className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"
          >
            <Download size={14} /> Download CSV template
          </a>
          <input
            className="input mb-2"
            placeholder="Optional: name this list"
            value={listName}
            onChange={(e) => setListName(e.target.value)}
          />
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <button className="btn-primary w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "Working…" : "Choose CSV file"}
          </button>
        </div>

        <div className="card">
          <div className="mb-3 flex items-center gap-2">
            <UserPlus size={18} className="text-neutral-900" />
            <h2 className="font-semibold text-neutral-900">Add a contact</h2>
          </div>
          <button className="btn-secondary w-full" onClick={() => setEdit("new")}>
            New contact
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-neutral-900">
          {msg}
        </div>
      )}

      {lists.length > 0 && (
        <div className="card">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks size={18} className="text-neutral-500" />
            <h2 className="font-semibold text-neutral-900">Lists</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {lists.map((l) => (
              <span key={l.id} className="badge bg-slate-100 text-neutral-900">
                {l.name} · {l.count}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-semibold text-neutral-900">
            All contacts <span className="text-neutral-500">({contacts.length})</span>
          </h2>
          <div className="relative w-64">
            <Search size={16} className="absolute left-3 top-2.5 text-neutral-500" />
            <input
              className="input pl-9"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">No contacts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-neutral-500">
                <tr className="border-b border-slate-100">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Practice</th>
                  <th className="py-2 pr-4 font-medium">Specialty</th>
                  <th className="py-2 pr-4 font-medium">Tags</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.slice(0, 200).map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setEdit(c)}
                  >
                    <td className="py-2 pr-4 text-neutral-900">
                      {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="py-2 pr-4 text-neutral-900">{c.email}</td>
                    <td className="py-2 pr-4 text-neutral-500">{c.practiceName ?? "—"}</td>
                    <td className="py-2 pr-4 text-neutral-500">{c.specialty ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {(c.tags ?? []).slice(0, 3).map((t) => (
                          <span key={t} className="badge bg-slate-100 text-neutral-700">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2">
                      {c.subscribed ? (
                        <span className="badge bg-neutral-900 text-white">Subscribed</span>
                      ) : (
                        <span className="badge bg-white text-neutral-500 ring-1 ring-inset ring-neutral-300">
                          Unsubscribed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 200 && (
              <p className="mt-3 text-center text-xs text-neutral-500">
                Showing first 200 of {filtered.length}.
              </p>
            )}
          </div>
        )}
      </div>

      {edit !== null && (
        <ContactModal
          contact={edit === "new" ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ContactModal({
  contact,
  onClose,
  onSaved,
}: {
  contact: Contact | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(contact);
  const [f, setF] = useState({
    email: contact?.email ?? "",
    firstName: contact?.firstName ?? "",
    lastName: contact?.lastName ?? "",
    practiceName: contact?.practiceName ?? "",
    specialty: contact?.specialty ?? "",
    city: contact?.city ?? "",
    tags: (contact?.tags ?? []).join(", "),
    subscribed: contact?.subscribed ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  async function save() {
    setBusy(true);
    setErr(null);
    const tags = f.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      if (isEdit && contact) {
        const res = await fetch(`/api/contacts/${contact.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: f.firstName,
            lastName: f.lastName,
            practiceName: f.practiceName,
            specialty: f.specialty,
            city: f.city,
            tags,
            subscribed: f.subscribed,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
      } else {
        const res = await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...f, tags }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
      }
      onSaved();
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  async function remove() {
    if (!contact || !window.confirm("Delete this contact permanently?")) return;
    setBusy(true);
    try {
      await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      onSaved();
    } catch {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">
            {isEdit ? "Edit contact" : "New contact"}
          </h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900">
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={f.email}
              onChange={(e) => set("email", e.target.value)}
              disabled={isEdit}
            />
          </div>
          <div>
            <label className="label">First name</label>
            <input className="input" value={f.firstName} onChange={(e) => set("firstName", e.target.value)} />
          </div>
          <div>
            <label className="label">Last name</label>
            <input className="input" value={f.lastName} onChange={(e) => set("lastName", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Practice name</label>
            <input className="input" value={f.practiceName} onChange={(e) => set("practiceName", e.target.value)} />
          </div>
          <div>
            <label className="label">Specialty</label>
            <input className="input" value={f.specialty} onChange={(e) => set("specialty", e.target.value)} />
          </div>
          <div>
            <label className="label">City</label>
            <input className="input" value={f.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Tags (comma-separated)</label>
            <input
              className="input"
              placeholder="e.g. dental, priority, austin"
              value={f.tags}
              onChange={(e) => set("tags", e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-900 sm:col-span-2">
            <input
              type="checkbox"
              checked={f.subscribed}
              onChange={(e) => set("subscribed", e.target.checked)}
            />
            Subscribed (unticking suppresses this contact from all sends)
          </label>
        </div>
        {err && <p className="mt-3 text-sm text-neutral-900">{err}</p>}
        <div className="mt-5 flex items-center justify-between">
          {isEdit ? (
            <button className="btn-danger" onClick={remove} disabled={busy}>
              <Trash2 size={15} /> Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={busy || !f.email.trim()}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
