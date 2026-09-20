/**
 * Subscription plans and their limits. Enforced server-side on contact import
 * and campaign send; the `plan` id lives on the Org doc and is set by a platform
 * admin (billing/checkout is a separate concern — this is the metering layer).
 *
 * Shared by client and server (no server-only imports here).
 */

export interface PlanLimits {
  id: string;
  name: string;
  /** Max stored contacts. */
  maxContacts: number;
  /** Max emails sent per calendar month (across all campaigns). */
  monthlySends: number;
  /** AI image generation available. */
  aiImages: boolean;
  /** A/B testing available. */
  abTesting: boolean;
}

export const PLANS: Record<string, PlanLimits> = {
  free: {
    id: "free",
    name: "Free",
    maxContacts: 500,
    monthlySends: 1000,
    aiImages: false,
    abTesting: false,
  },
  starter: {
    id: "starter",
    name: "Starter",
    maxContacts: 5000,
    monthlySends: 20000,
    aiImages: true,
    abTesting: true,
  },
  pro: {
    id: "pro",
    name: "Pro",
    maxContacts: 50000,
    monthlySends: 200000,
    aiImages: true,
    abTesting: true,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    maxContacts: Number.MAX_SAFE_INTEGER,
    monthlySends: Number.MAX_SAFE_INTEGER,
    aiImages: true,
    abTesting: true,
  },
};

export const DEFAULT_PLAN = "free";

/** Resolve a plan id (falling back to Free for unknown/unset ids). */
export function planFor(planId?: string): PlanLimits {
  return (planId && PLANS[planId]) || PLANS[DEFAULT_PLAN];
}

/** "YYYY-MM" for the given epoch in a timezone (matches Org.sentMonth). */
export function monthKey(epoch: number, timeZone: string): string {
  // en-CA yields ISO-ish "YYYY-MM-DD"; take the year-month.
  const d = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(epoch);
  return d.slice(0, 7);
}

/** "YYYY-MM-DD" for the given epoch in a timezone (matches Integration.sentDate). */
export function dayKey(epoch: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(epoch);
}
