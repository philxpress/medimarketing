import { Activity, CheckCircle2 } from "lucide-react";
import { adminDb } from "@/lib/firebase/admin";
import { verifyUnsubscribeToken } from "@/lib/email/compliance";

export const dynamic = "force-dynamic";

/**
 * Public unsubscribe page. Reaching it with a valid token immediately opts the
 * contact out (no login required), then confirms.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token ?? "";
  const parsed = verifyUnsubscribeToken(token);
  let email = "";
  let ok = false;

  if (parsed) {
    const ref = adminDb
      .collection("orgs")
      .doc(parsed.orgId)
      .collection("contacts")
      .doc(parsed.contactId);
    const snap = await ref.get();
    if (snap.exists) {
      email = (snap.data()?.email as string) ?? "";
      await ref.set({ subscribed: false, updatedAt: Date.now() }, { merge: true });
      ok = true;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Activity size={18} />
          </span>
          <span className="text-xl font-bold text-slate-900">MedReach</span>
        </div>
        <div className="card">
          {ok ? (
            <>
              <CheckCircle2 className="mx-auto mb-3 text-emerald-500" size={40} />
              <h1 className="text-lg font-semibold text-slate-900">You&apos;re unsubscribed</h1>
              <p className="mt-2 text-sm text-slate-500">
                {email && <span className="font-medium">{email}</span>} will no longer receive
                marketing emails from this sender.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-slate-900">Link not valid</h1>
              <p className="mt-2 text-sm text-slate-500">
                This unsubscribe link is invalid or has expired. If you keep receiving unwanted
                email, reply to the message and ask to be removed.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
