"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, Database, ListChecks, Search } from "lucide-react";
import type { Contact } from "@/lib/types";

interface ListSummary {
  id: string;
  name: string;
  count: number;
}

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
  const fileRef = useRef<HTMLInputElement>(null);
  const [listName, setListName] = useState("");

  const filtered = contacts.filter((c) => {
    const q = query.toLowerCase();
    return (
      !q ||
      c.email.toLowerCase().includes(q) ||
      `${c.firstName ?? ""} ${c.lastName ?? ""}`.toLowerCase().includes(q) ||
      (c.practiceName ?? "").toLowerCase().includes(q)
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

  async function loadSample() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/contacts/sample", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`Loaded ${data.imported} sample contacts.`);
      router.refresh();
    } catch (err) {
      setMsg(`Failed: ${err}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center gap-2">
            <Upload size={18} className="text-brand-500" />
            <h2 className="font-semibold text-slate-900">Upload a CSV</h2>
          </div>
          <p className="mb-3 text-sm text-slate-500">
            Columns recognised: <code className="text-xs">email, firstName, lastName, practiceName,
            specialty, city</code>. Any extra columns become custom merge fields. Email is required.
          </p>
          <input
            className="input mb-2"
            placeholder="Optional: name this list (e.g. Q3 Dental Outreach)"
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
          <button
            className="btn-primary w-full"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? "Working…" : "Choose CSV file"}
          </button>
        </div>

        <div className="card">
          <div className="mb-3 flex items-center gap-2">
            <Database size={18} className="text-teal-600" />
            <h2 className="font-semibold text-slate-900">Use the provided list</h2>
          </div>
          <p className="mb-3 text-sm text-slate-500">
            Load a demo list of {12} fictional medical practices so you can try mail merge and
            campaigns right away.
          </p>
          <button className="btn-secondary w-full" disabled={busy} onClick={loadSample}>
            Load sample medical list
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm text-brand-800">
          {msg}
        </div>
      )}

      {lists.length > 0 && (
        <div className="card">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks size={18} className="text-slate-500" />
            <h2 className="font-semibold text-slate-900">Lists</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {lists.map((l) => (
              <span key={l.id} className="badge bg-slate-100 text-slate-700">
                {l.name} · {l.count}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-semibold text-slate-900">
            All contacts <span className="text-slate-400">({contacts.length})</span>
          </h2>
          <div className="relative w-64">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No contacts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr className="border-b border-slate-100">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Practice</th>
                  <th className="py-2 pr-4 font-medium">Specialty</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.slice(0, 200).map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2 pr-4 text-slate-700">
                      {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="py-2 pr-4 text-slate-600">{c.email}</td>
                    <td className="py-2 pr-4 text-slate-600">{c.practiceName ?? "—"}</td>
                    <td className="py-2 pr-4 text-slate-500">{c.specialty ?? "—"}</td>
                    <td className="py-2">
                      {c.subscribed ? (
                        <span className="badge bg-neutral-900 text-white">Subscribed</span>
                      ) : (
                        <span className="badge bg-white text-neutral-500 ring-1 ring-inset ring-neutral-300">Unsubscribed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 200 && (
              <p className="mt-3 text-center text-xs text-slate-400">
                Showing first 200 of {filtered.length}.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
