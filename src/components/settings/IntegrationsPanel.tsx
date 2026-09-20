"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";

interface Conn {
  email: string;
  status: string;
  lastError?: string;
  canReadMailbox?: boolean;
}

export function IntegrationsPanel({
  gmail,
  microsoft,
}: {
  gmail: Conn | null | undefined;
  microsoft: Conn | null | undefined;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    const status = params.get("status");
    const error = params.get("error");
    const integ = params.get("integration");
    if (status === "connected") setBanner(`${cap(integ)} mailbox connected.`);
    else if (error === "norefresh")
      setBanner(
        `${cap(integ)} did not return a refresh token. Remove MediReach from your account's app permissions, then reconnect.`
      );
    else if (error) setBanner(`${cap(integ)} connection failed: ${error}`);
  }, [params]);

  async function disconnect(provider: "gmail" | "microsoft") {
    await fetch(`/api/integrations/${provider}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {banner && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm text-brand-800">
          {banner}
        </div>
      )}
      <Card
        name="Gmail / Google Workspace"
        desc="Send campaigns from your Google mailbox via the Gmail API."
        conn={gmail}
        connectHref="/api/integrations/google/connect"
        onDisconnect={() => disconnect("gmail")}
      />
      <Card
        name="Microsoft 365 / Outlook"
        desc="Send campaigns from your Microsoft mailbox via Microsoft Graph."
        conn={microsoft}
        connectHref="/api/integrations/microsoft/connect"
        onDisconnect={() => disconnect("microsoft")}
      />
      <p className="text-xs text-neutral-900">
        Sending happens through your own mailbox, so it inherits your provider&apos;s daily sending
        limits. For high-volume sending, connect a dedicated marketing mailbox.
      </p>
    </div>
  );
}

function Card({
  name,
  desc,
  conn,
  connectHref,
  onDisconnect,
}: {
  name: string;
  desc: string;
  conn: Conn | null | undefined;
  connectHref: string;
  onDisconnect: () => void;
}) {
  const connected = conn && conn.status === "connected";
  const errored = conn && conn.status === "error";
  return (
    <div
      className={`card flex items-center justify-between gap-4 ${
        errored ? "border-amber-300 bg-amber-50/40" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-neutral-900">
          <Mail size={18} />
        </span>
        <div>
          <div className="font-medium text-neutral-900">{name}</div>
          <div className="text-sm text-neutral-900">{desc}</div>
          {connected && (
            <>
              <div className="mt-1 flex items-center gap-1 text-sm text-neutral-900">
                <CheckCircle2 size={14} /> {conn!.email}
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
                <ShieldCheck size={12} />
                {conn!.canReadMailbox
                  ? "Bounce detection enabled"
                  : "Send-only — reconnect to enable bounce detection"}
              </div>
            </>
          )}
          {errored && (
            <div className="mt-1 text-sm text-amber-800">
              <XCircle size={14} className="mr-1 inline" />
              Disconnected — reconnect to resume sending.
              {conn!.lastError && (
                <span className="ml-1 text-xs text-amber-700">({conn!.lastError})</span>
              )}
            </div>
          )}
          {conn && conn.status !== "connected" && !errored && (
            <div className="mt-1 flex items-center gap-1 text-sm text-neutral-900">
              <XCircle size={14} /> {conn.status}
            </div>
          )}
        </div>
      </div>
      {connected ? (
        <button className="btn-secondary" onClick={onDisconnect}>
          Disconnect
        </button>
      ) : (
        <a className="btn-primary" href={connectHref}>
          {errored ? "Reconnect" : "Connect"}
        </a>
      )}
    </div>
  );
}

function cap(s: string | null): string {
  if (!s) return "Mailbox";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
