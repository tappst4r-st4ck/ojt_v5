import "server-only";
import { createHash } from "node:crypto";
import { getSharedRedis } from "./shared-redis.mjs";
import { getRequestClientIp, recordLocalFailure, getLocalLockout, clearLocalLockout } from "./security-state.mjs";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const localAttempts = new Map();

const INCREMENT_FAILURE_SCRIPT = `
local lockTtl = redis.call("PTTL", KEYS[2])
if lockTtl > 0 then return lockTtl end
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
if count >= tonumber(ARGV[2]) then
  redis.call("SET", KEYS[2], "1", "PX", ARGV[3])
  return redis.call("PTTL", KEYS[2])
end
return 0
`;

function getKeys(request) {
  const ip = getRequestClientIp(request);
  if (!ip) return null;
  const identifier = createHash("sha256").update(ip).digest("hex");
  return {
    attempts: `tesda:auth-failures:${identifier}`,
    lock: `tesda:auth-lock:${identifier}`,
  };
}

export async function recordFailedAttempt(request) {
  const keys = getKeys(request);
  if (!keys) throw new Error("A trusted client IP is required for account lockout.");

  const redis = getSharedRedis();
  if (redis) {
    await redis.eval(
      INCREMENT_FAILURE_SCRIPT,
      [keys.attempts, keys.lock],
      [String(LOCKOUT_DURATION_MS), String(MAX_FAILED_ATTEMPTS), String(LOCKOUT_DURATION_MS)]
    );
    return;
  }
  if (process.env.NODE_ENV === "production") throw new Error("Shared lockout storage is not configured.");

  recordLocalFailure(localAttempts, keys.attempts, {
    now: Date.now(),
    windowMs: LOCKOUT_DURATION_MS,
    maxAttempts: MAX_FAILED_ATTEMPTS,
  });
}

export async function recordSuccess(request) {
  const keys = getKeys(request);
  if (!keys) throw new Error("A trusted client IP is required for account lockout.");

  const redis = getSharedRedis();
  if (redis) {
    await redis.del(keys.attempts, keys.lock);
    return;
  }
  if (process.env.NODE_ENV === "production") throw new Error("Shared lockout storage is not configured.");
  clearLocalLockout(localAttempts, keys.attempts);
}

export async function checkLockout(request) {
  const keys = getKeys(request);
  if (!keys) return { locked: true, unavailable: true, retryAfter: 60 };

  const redis = getSharedRedis();
  if (redis) {
    try {
      const retryAfter = await redis.ttl(keys.lock);
      return retryAfter > 0
        ? { locked: true, retryAfter }
        : { locked: false };
    } catch {
      return { locked: true, unavailable: true, retryAfter: 60 };
    }
  }
  if (process.env.NODE_ENV === "production") return { locked: true, unavailable: true, retryAfter: 60 };

  return getLocalLockout(localAttempts, keys.attempts, Date.now());
}