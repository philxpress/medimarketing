"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { AUSTRALIAN_TIMEZONES, DEFAULT_TIMEZONE } from "@/lib/tz";

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [postalAddress, setPostalAddress] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Make sure an org shell exists before we let them fill it in.
  useEffect(() => {
    fetch("/api/org/bootstrap", { method: "POST" }).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/org/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, postalAddress, replyToEmail, timezone }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Set up your workspace"
      subtitle="A couple of details we need before you can send email."
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Organization / practice name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Postal address</label>
          <textarea
            className="input"
            rows={3}
            placeholder="123 Health St, Suite 100, City, State ZIP"
            value={postalAddress}
            onChange={(e) => setPostalAddress(e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-neutral-900">
            Legally required in every marketing email (CAN-SPAM). Shown in the footer.
          </p>
        </div>
        <div>
          <label className="label">Reply-to email (optional)</label>
          <input
            type="email"
            className="input"
            value={replyToEmail}
            onChange={(e) => setReplyToEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Timezone</label>
          <select
            className="input"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {AUSTRALIAN_TIMEZONES.map((z) => (
              <option key={z.value} value={z.value}>
                {z.label}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-neutral-900">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </form>
    </AuthShell>
  );
}
