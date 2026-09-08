import { Activity } from "lucide-react";

export function AuthShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-neutral-100 via-white to-neutral-200 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Activity size={22} />
          </span>
          <span className="text-2xl font-bold tracking-tight text-neutral-900">MediReach</span>
        </div>
        <div className="card">
          <h1 className="mb-6 text-xl font-semibold text-neutral-900">{title}</h1>
          {children}
        </div>
        <p className="mt-4 text-center text-xs text-neutral-900">
          For authorized marketing use. Follow CAN-SPAM and applicable healthcare rules.
        </p>
      </div>
    </div>
  );
}

export function ProviderButtons({
  onGoogle,
  onMicrosoft,
  disabled,
}: {
  onGoogle: () => void;
  onMicrosoft: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <button className="btn-secondary w-full" onClick={onGoogle} disabled={disabled} type="button">
        <GoogleIcon /> Continue with Google
      </button>
      <button className="btn-secondary w-full" onClick={onMicrosoft} disabled={disabled} type="button">
        <MicrosoftIcon /> Continue with Microsoft
      </button>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  );
}
