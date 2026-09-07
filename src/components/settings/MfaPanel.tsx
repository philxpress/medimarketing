"use client";

import { useState } from "react";
import { ShieldCheck, Shield } from "lucide-react";
import QRCode from "qrcode";
import type { TotpSecret } from "firebase/auth";
import { startTotpEnrollment, finishTotpEnrollment } from "@/lib/auth/client";

export function MfaPanel({
  initialEnrolled,
  email,
}: {
  initialEnrolled: boolean;
  email: string;
}) {
  const [enrolled, setEnrolled] = useState(initialEnrolled);
  const [step, setStep] = useState<"idle" | "setup">("idle");
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [sharedKey, setSharedKey] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function begin() {
    setError(null);
    setBusy(true);
    try {
      const e = await startTotpEnrollment(email);
      setSecret(e.secret);
      // Render the QR locally so the TOTP secret never leaves the browser.
      setQrDataUrl(await QRCode.toDataURL(e.qrUri, { margin: 1, width: 176 }));
      setSharedKey(e.sharedKey);
      setStep("setup");
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!secret) return;
    setError(null);
    setBusy(true);
    try {
      await finishTotpEnrollment(secret, code);
      setEnrolled(true);
      setStep("idle");
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  if (enrolled) {
    return (
      <div className="card flex items-center gap-3">
        <ShieldCheck className="text-neutral-900" size={22} />
        <div>
          <div className="font-medium text-slate-900">Two-factor authentication is on</div>
          <div className="text-sm text-slate-500">
            You&apos;ll be asked for a code from your authenticator app when you sign in.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <Shield className="text-slate-400" size={22} />
        <div className="flex-1">
          <div className="font-medium text-slate-900">Two-factor authentication (TOTP)</div>
          <div className="text-sm text-slate-500">
            Add a second factor with an authenticator app (Google Authenticator, Authy, 1Password).
          </div>
        </div>
        {step === "idle" && (
          <button className="btn-primary" onClick={begin} disabled={busy}>
            {busy ? "…" : "Enable 2FA"}
          </button>
        )}
      </div>

      {step === "setup" && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-3 text-sm text-slate-600">
            Scan this QR code in your authenticator app, then enter the 6-digit code to confirm.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="TOTP QR code"
              width={160}
              height={160}
              className="rounded-lg border border-slate-200"
              src={qrDataUrl}
            />
            <div className="flex-1 space-y-3">
              <div>
                <div className="text-xs text-slate-400">Can&apos;t scan? Enter this key manually:</div>
                <code className="break-all text-xs text-slate-600">{sharedKey}</code>
              </div>
              <input
                className="input max-w-[12rem] text-center tracking-[0.3em]"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
              {error && <p className="text-sm text-neutral-900">{error}</p>}
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setStep("idle")} disabled={busy}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={confirm} disabled={busy || code.length !== 6}>
                  {busy ? "Verifying…" : "Confirm & enable"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && step === "idle" && <p className="mt-3 text-sm text-neutral-900">{error}</p>}
    </div>
  );
}

function friendly(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  if (code === "auth/requires-recent-login")
    return "For security, please sign out and back in, then try enabling 2FA again.";
  if (code === "auth/invalid-verification-code") return "That code was incorrect. Try again.";
  if (code === "auth/unsupported-first-factor" || code === "auth/operation-not-allowed")
    return "Enable TOTP MFA in your Firebase console (Authentication → Sign-in method).";
  return "Couldn't complete 2FA setup. Please try again.";
}
