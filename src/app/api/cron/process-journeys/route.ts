import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { sendSingle } from "@/lib/email/sendSingle";
import { getIntegrationRaw } from "@/lib/data";
import type { Contact, Enrollment, Journey, Org } from "@/lib/types";

// Dynamic: scheduled job, never prerendered.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron target. Advances every enrollment whose next step is due: sends
 * that step's email, then schedules the following step (or completes). Guarded
 * by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const due = await adminDb
    .collectionGroup("enrollments")
    .where("status", "==", "active")
    .where("nextRunAt", "<=", now)
    .limit(25)
    .get();

  let processed = 0;
  for (const doc of due.docs) {
    const enr = doc.data() as Enrollment;
    const journeyRef = doc.ref.parent.parent; // orgs/{o}/journeys/{j}
    const orgId = journeyRef?.parent.parent?.id;
    if (!journeyRef || !orgId) continue;

    try {
      const [journeySnap, orgSnap, contactSnap] = await Promise.all([
        journeyRef.get(),
        adminDb.collection("orgs").doc(orgId).get(),
        adminDb.collection("orgs").doc(orgId).collection("contacts").doc(enr.contactId).get(),
      ]);
      const journey = journeySnap.data() as Journey | undefined;
      const org = orgSnap.data() as Org | undefined;
      const contact = contactSnap.data() as Contact | undefined;

      // Guard rails: pause if journey inactive, contact gone/unsubscribed.
      if (!journey || !journey.active || !org) continue;
      if (!contact || !contact.subscribed) {
        await doc.ref.set({ status: "cancelled", updatedAt: now }, { merge: true });
        continue;
      }

      const step = journey.steps[enr.currentStep];
      if (!step) {
        await doc.ref.set({ status: "completed", updatedAt: now }, { merge: true });
        continue;
      }

      const integration = await getIntegrationRaw(orgId, journey.fromProvider);
      if (!integration || integration.status !== "connected") {
        await doc.ref.set(
          { status: "failed", lastError: "mailbox not connected", updatedAt: now },
          { merge: true }
        );
        continue;
      }

      await sendSingle(orgId, org, journey.fromProvider, integration, contact, step.subject, step.body);
      processed++;

      const next = enr.currentStep + 1;
      const nextStep = journey.steps[next];
      if (nextStep) {
        await doc.ref.set(
          {
            currentStep: next,
            nextRunAt: now + nextStep.delayHours * 3600_000,
            updatedAt: now,
          },
          { merge: true }
        );
      } else {
        await doc.ref.set({ status: "completed", updatedAt: now }, { merge: true });
      }
    } catch (err) {
      await doc.ref.set(
        { status: "failed", lastError: String(err).slice(0, 200), updatedAt: now },
        { merge: true }
      );
    }
  }

  return NextResponse.json({ processed, due: due.size });
}
