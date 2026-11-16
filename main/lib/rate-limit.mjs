import "server-only";
import { createHash } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { getSharedRedis } from "./shared-redis.mjs";
import { consumeLocalRateLimit, getRequestClientIp } from "./security-state.mjs";

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 30; // per window per IP
const localBuckets = new Map();

let distributedLimiter;
let distributedRedis;

export { getRequestClientIp as getClientIp } from "./security-state.mjs";

function getDistributedLimiter(redis) {
  if (!distributedLimiter || distributedRedis !== redis) {
    distributedRedis = redis;
    distributedLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(MAX_REQUESTS, "60 s"),
      prefix: "tesda:api",
      analytics: false,
      enableTelemetry: false,
    });
  }
  return distributedLimiter;
}

function unavailableResult() {
  return { allowed: false, unavailable: true, limit: MAX_REQUESTS, remaining: 0, retryAfter: 60 };
}

export async function rateLimit(request) {
  const ip = getRequestClientIp(request);
  if (!ip) return unavailableResult();

  try {
    const redis = getSharedRedis();
    if (redis) {
      const identifier = createHash("sha256").update(ip).digest("hex");
      const result = await getDistributedLimiter(redis).limit(identifier);
      return {
        allowed: result.success,
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset,
        retryAfter: result.success ? undefined : Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
      };
    }
  } catch {
    return unavailableResult();
  }

  if (process.env.NODE_ENV === "production") return unavailableResult();
  const identifier = createHash("sha256").update(ip).digest("hex");
  return consumeLocalRateLimit(localBuckets, identifier, {
    now: Date.now(),
    windowMs: WINDOW_MS,
    maxRequests: MAX_REQUESTS,
  });
}

export function rateLimitHeaders(result) {
  const headers = {
    "X-RateLimit-Limit": String(result.limit ?? MAX_REQUESTS),
    "X-RateLimit-Remaining": String(result.remaining ?? 0),
    "X-RateLimit-Window-Ms": String(WINDOW_MS),
  };
  if (result.reset) headers["X-RateLimit-Reset"] = String(Math.ceil(result.reset / 1000));
  if (!result.allowed && result.retryAfter) {
    headers["Retry-After"] = String(result.retryAfter);
  }
  return headers;
}

export function rateLimitResponse(result) {
  return Response.json(
    { error: result.unavailable ? "Rate limiting is unavailable." : "Too many requests. Please try again later." },
    { status: result.unavailable ? 503 : 429, headers: rateLimitHeaders(result) }
  );
}