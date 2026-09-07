"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  signupWithEmail,
  loginWithGoogle,
  loginWithMicrosoft,
} from "@/lib/auth/client";
import { AuthShell, ProviderButtons } from "@/components/AuthShell";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      setError(humanError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Start sending compliant campaigns in minutes.">
      <ProviderButtons
        onGoogle={() => run(loginWithGoogle)}
        onMicrosoft={() => run(loginWithMicrosoft)}
        disabled={busy}
      />
      <div className="my-5 flex items-center gap-3 text-xs text-neutral-900">
        <span className="h-px flex-1 bg-slate-200" /> OR <span className="h-px flex-1 bg-slate-200" />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => signupWithEmail(email, password, name));
        }}
        className="space-y-4"
      >
        <div>
          <label className="label">Full name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Work email</label>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <p className="mt-1 text-xs text-neutral-900">At least 8 characters. You can enable 2FA after signing in.</p>
        </div>
        {error && <p className="text-sm text-neutral-900">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-neutral-900">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

function humanError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/email-already-in-use": "That email is already registered. Try signing in.",
    "auth/weak-password": "Choose a stronger password (8+ characters).",
    "auth/invalid-email": "Enter a valid email address.",
  };
  return map[code] ?? "Something went wrong. Please try again.";
}
