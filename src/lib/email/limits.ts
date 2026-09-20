/**
 * Send-quota accounting for the subscription plan. Sending goes through the
 * user's own mailbox, so we do NOT cap per-mailbox volume — the provider's own
 * limits apply there. The only ceiling we enforce is the org's monthly plan
 * allowance, reserved atomically before a batch sends and refunded if a message
 * fails to hand off.
 */
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { planFor, monthKey } from "@/lib/plans";

export interface Quota {
  /** How many messages this batch may send (monthly allowance remaining). */
  allowed: number;
  monthlyRemaining: number;
}

/**
 * Atomically reserve up to `want` sends against the org's monthly plan quota.
 * Returns how many were actually reserved (may be less, or zero if the monthly
 * ceiling is hit). The caller sends exactly `allowed` messages and
 * `refundSend()`s any that fail.
 */
export async function reserveQuota(
  orgId: string,
  timezone: string,
  want: number
): Promise<Quota> {
  const orgRef = adminDb.collection("orgs").doc(orgId);
  const month = monthKey(Date.now(), timezone);

  return adminDb.runTransaction(async (tx) => {
    const orgSnap = await tx.get(orgRef);
    const org = orgSnap.data() ?? {};

    const plan = planFor(org.plan);
    const monthUsed = org.sentMonth === month ? org.sentThisMonth ?? 0 : 0;
    const monthlyRemaining = Math.max(0, plan.monthlySends - monthUsed);

    const allowed = Math.max(0, Math.min(want, monthlyRemaining));
    if (allowed > 0) {
      tx.set(
        orgRef,
        { sentMonth: month, sentThisMonth: monthUsed + allowed },
        { merge: true }
      );
    }
    return { allowed, monthlyRemaining };
  });
}

/** Give back one reserved send (used when a message fails to dispatch). */
export async function refundSend(orgId: string): Promise<void> {
  await adminDb
    .collection("orgs")
    .doc(orgId)
    .set({ sentThisMonth: FieldValue.increment(-1) }, { merge: true });
}

/** Remaining monthly send allowance for an org (for pre-send UI/validation). */
export function monthlyRemaining(
  plan: ReturnType<typeof planFor>,
  sentThisMonth: number | undefined,
  sentMonth: string | undefined,
  timezone: string
): number {
  const month = monthKey(Date.now(), timezone);
  const used = sentMonth === month ? sentThisMonth ?? 0 : 0;
  return Math.max(0, plan.monthlySends - used);
}
