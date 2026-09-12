"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

export function NewCompanyForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [plan, setPlan] = useState("trial");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, adminEmail, plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCompanyName("");
      setAdminEmail("");
      setOpen(false);
      router.push(`/admin/companies/${data.orgId}`);
      router.refresh();
    } catch (err) {
      setMsg(`Failed: ${err}`);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        <Plus size={16} /> New company
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-md space-y-3">
      <h2 className="font-semibold text-neutral-900">New company</h2>
      <div>
        <label className="label">Company name</label>
        <input
          className="input"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="e.g. Northside Medical Group"
          autoFocus
          required
        />
      </div>
      <div>
        <label className="label">Admin email (invited as owner)</label>
        <input
          type="email"
          className="input"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          placeholder="admin@company.com"
          required
        />
      </div>
      <div>
        <label className="label">Plan</label>
        <input
          className="input"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          placeholder="trial"
        />
      </div>
      {msg && <p className="text-sm text-neutral-900">{msg}</p>}
      <div className="flex gap-3">
        <button className="btn-primary" disabled={busy || !companyName.trim() || !adminEmail.trim()}>
          {busy ? "Creating…" : "Create & invite"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <p className="text-xs text-neutral-500">
        Creates the company and a pending owner invite. They become owner when they first sign
        in with this email.
      </p>
    </form>
  );
}
