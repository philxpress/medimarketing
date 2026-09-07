"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MultiFactorResolver } from "firebase/auth";
import {
  loginWithEmail,
  loginWithGoogle,
  loginWithMicrosoft,
  completeMfa,
  MfaRequired,
} from "@/lib/auth/client";
import { AuthShell, ProviderButtons } from "@/components/AuthShell";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [code, setCode] = useState("");

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      if (err instanceof MfaRequired) {
        setMfaResolver(err.resolver);
      } else {
        setError(humanError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  if (mfaResolver) {
    return (
      <AuthShell title="Two-factor authentication" subtitle="Enter the 6-digit code from your authenticator app.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await completeMfa(mfaResolver, code);
            });
          }}
          className="space-y-4"
        >
          <input
            className="input text-center text-lg tracking-[0.4em]"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoFocus
          />
          {error && <p className="text-sm text-neutral-900">{error}</p>}
          <button className="btn-primary w-full" disabled={busy || code.length !== 6}>
            {busy ? "Verifying…" : "Verify"}
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Sign in to MediReach" subtitle="Compliant email marketing for the medical sector.">
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
          run(() => loginWithEmail(email, password));
        }}
        className="space-y-4"
      >
        <div>
          <label className="label">Work email</label>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-neutral-900">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-neutral-900">
        No account?{" "}
        <Link href="/signup" className="font-medium text-brand-600 hover:underline">
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}

function humanError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/user-not-found": "No account with that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/too-many-requests": "Too many attempts. Try again shortly.",
    "auth/popup-closed-by-user": "Sign-in window was closed.",
  };
  return map[code] ?? "Something went wrong. Please try again.";
}
