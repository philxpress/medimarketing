/**
 * Timezone helpers (Australia for now). Uses the built-in Intl API so the same
 * code works on the server and in the browser — no external date library.
 */

export const DEFAULT_TIMEZONE = "Australia/Sydney";

export const AUSTRALIAN_TIMEZONES: { value: string; label: string }[] = [
  { value: "Australia/Sydney", label: "Sydney (NSW/ACT) — AEST/AEDT" },
  { value: "Australia/Melbourne", label: "Melbourne (VIC) — AEST/AEDT" },
  { value: "Australia/Brisbane", label: "Brisbane (QLD) — AEST (no DST)" },
  { value: "Australia/Adelaide", label: "Adelaide (SA) — ACST/ACDT" },
  { value: "Australia/Perth", label: "Perth (WA) — AWST (no DST)" },
  { value: "Australia/Darwin", label: "Darwin (NT) — ACST (no DST)" },
  { value: "Australia/Hobart", label: "Hobart (TAS) — AEST/AEDT" },
];

/** The offset (wall-clock minus UTC), in ms, of `timeZone` at instant `ts`. */
function tzOffsetMs(ts: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(new Date(ts))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - ts;
}

/**
 * Convert a "YYYY-MM-DDTHH:mm" wall-clock string (as produced by an
 * <input type="datetime-local">) interpreted in `timeZone` to epoch ms.
 * Handles DST by refining the offset once around the target instant.
 */
export function zonedTimeToEpoch(local: string, timeZone: string): number {
  const [datePart, timePart] = local.split("T");
  if (!datePart || !timePart) return NaN;
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const naiveUTC = Date.UTC(y, m - 1, d, hh, mm);
  let ts = naiveUTC - tzOffsetMs(naiveUTC, timeZone);
  ts = naiveUTC - tzOffsetMs(ts, timeZone); // second pass for DST edges
  return ts;
}

/** Format an epoch ms value for display in `timeZone` (AU-style). */
export function formatInTz(ts: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ts));
}

/** Short zone abbreviation right now, e.g. "AEDT". */
export function tzAbbrev(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(new Date());
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}
