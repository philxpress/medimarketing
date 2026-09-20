import { test } from "node:test";
import assert from "node:assert/strict";

process.env.TOKEN_ENCRYPTION_KEY ??= "test-secret-key";

import { makeTrackToken, verifyTrackToken } from "../src/lib/email/tracking";
import {
  makeUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../src/lib/email/compliance";
import { buildMime } from "../src/lib/email/mime";
import { withPreheader } from "../src/lib/email/preheader";
import { verifyEmails } from "../src/lib/email/verify";

test("track token round-trips", () => {
  const t = makeTrackToken("org1", "camp1", "c1");
  assert.deepEqual(verifyTrackToken(t), {
    orgId: "org1",
    campaignId: "camp1",
    contactId: "c1",
  });
});

test("track token rejects tampering", () => {
  const t = makeTrackToken("org1", "camp1", "c1");
  const tampered = t.slice(0, -2) + (t.endsWith("a") ? "bb" : "aa");
  assert.equal(verifyTrackToken(tampered), null);
});

test("unsubscribe token round-trips and rejects garbage", () => {
  const t = makeUnsubscribeToken("orgX", "contactY");
  assert.deepEqual(verifyUnsubscribeToken(t), {
    orgId: "orgX",
    contactId: "contactY",
  });
  assert.equal(verifyUnsubscribeToken("not.a.token"), null);
});

test("buildMime produces a multipart/alternative with a plain-text part", () => {
  const raw = buildMime({
    fromName: "Clinic",
    fromEmail: "a@b.com",
    to: "x@y.com",
    subject: "Hi",
    html: "<p>Hello <strong>there</strong></p>",
  });
  assert.match(raw, /multipart\/alternative/);
  assert.match(raw, /text\/plain/);
  assert.match(raw, /text\/html/);
  // Plain text is derived from the HTML.
  assert.match(raw, /Hello there/);
});

test("buildMime adds one-click unsubscribe headers", () => {
  const raw = buildMime({
    fromName: "Clinic",
    fromEmail: "a@b.com",
    to: "x@y.com",
    subject: "Hi",
    html: "<p>Hi</p>",
    unsubscribeUrl: "https://app/api/unsubscribe?token=abc",
  });
  assert.match(raw, /List-Unsubscribe: <https:\/\/app\/api\/unsubscribe\?token=abc>/);
  assert.match(raw, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
});

test("preheader is hidden and precedes the body", () => {
  const out = withPreheader("<p>Body</p>", "Sneak peek");
  assert.match(out, /display:none/);
  assert.match(out, /Sneak peek/);
  assert.ok(out.indexOf("Sneak peek") < out.indexOf("<p>Body</p>"));
});

test("email verification flags syntax and disposable (no DNS)", async () => {
  const res = await verifyEmails(
    ["good@example.com", "nope", "user@mailinator.com"],
    { maxDnsDomains: 0 }
  );
  assert.equal(res.get("good@example.com")?.valid, true);
  assert.equal(res.get("nope")?.valid, false);
  assert.equal(res.get("nope")?.reason, "syntax");
  assert.equal(res.get("user@mailinator.com")?.reason, "disposable");
});
