import { test } from "node:test";
import assert from "node:assert/strict";

import { planFor, monthKey, dayKey } from "../src/lib/plans";

test("planFor falls back to free for unknown ids", () => {
  assert.equal(planFor(undefined).id, "free");
  assert.equal(planFor("nonsense").id, "free");
  assert.equal(planFor("pro").id, "pro");
});

test("monthKey / dayKey format in a timezone", () => {
  // 2026-01-15T12:00:00Z
  const epoch = Date.UTC(2026, 0, 15, 12, 0, 0);
  assert.equal(monthKey(epoch, "UTC"), "2026-01");
  assert.equal(dayKey(epoch, "UTC"), "2026-01-15");
});

test("plans define ascending contact and send limits", () => {
  assert.ok(planFor("free").maxContacts < planFor("starter").maxContacts);
  assert.ok(planFor("starter").monthlySends < planFor("pro").monthlySends);
});
