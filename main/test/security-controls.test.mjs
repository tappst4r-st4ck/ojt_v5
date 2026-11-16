import test from "node:test";
import assert from "node:assert/strict";
import {
  clearLocalLockout,
  consumeLocalRateLimit,
  getLocalLockout,
  getRequestClientIp,
  recordLocalFailure,
} from "../lib/security-state.mjs";

test("production client IP selection ignores untrusted forwarded-for fallback", () => {
  const forwardedOnly = new Request("https://tesda.example", {
    headers: { "x-forwarded-for": "198.51.100.10, 10.0.0.1" },
  });
  assert.equal(getRequestClientIp(forwardedOnly, true), null);

  const trustedProxy = new Request("https://tesda.example", {
    headers: {
      "x-real-ip": "203.0.113.8",
      "x-forwarded-for": "198.51.100.10, 10.0.0.1",
    },
  });
  assert.equal(getRequestClientIp(trustedProxy, true), "203.0.113.8");
  assert.equal(getRequestClientIp(forwardedOnly, false), "198.51.100.10");
});

test("local rate limit allows the configured window then resets", () => {
  const buckets = new Map();
  const options = { now: 1_000, windowMs: 60_000, maxRequests: 30 };

  for (let attempt = 0; attempt < 30; attempt++) {
    assert.equal(consumeLocalRateLimit(buckets, "client-a", options).allowed, true);
  }
  const blocked = consumeLocalRateLimit(buckets, "client-a", options);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfter, 60);
  assert.equal(consumeLocalRateLimit(buckets, "client-a", { ...options, now: 61_000 }).allowed, true);
});

test("failed attempts lock an IP after five failures and clear on success", () => {
  const attempts = new Map();
  const options = { now: 10_000, windowMs: 900_000, maxAttempts: 5 };

  for (let attempt = 0; attempt < 4; attempt++) {
    recordLocalFailure(attempts, "client-b", { ...options, now: options.now + attempt * 1_000 });
  }
  assert.deepEqual(getLocalLockout(attempts, "client-b", 14_000), { locked: false });

  recordLocalFailure(attempts, "client-b", { ...options, now: 14_000 });
  assert.equal(getLocalLockout(attempts, "client-b", 14_001).locked, true);
  assert.deepEqual(getLocalLockout(attempts, "client-b", 914_000), { locked: false });

  recordLocalFailure(attempts, "client-b", options);
  clearLocalLockout(attempts, "client-b");
  assert.deepEqual(getLocalLockout(attempts, "client-b", options.now), { locked: false });
});