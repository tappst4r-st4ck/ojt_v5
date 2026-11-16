export function getRequestClientIp(request, isProduction = process.env.NODE_ENV === "production") {
  const trustedIp = request.headers.get("x-real-ip")?.trim();
  if (trustedIp) return trustedIp;

  if (!isProduction) {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return "local";
  }

  return null;
}

export function consumeLocalRateLimit(buckets, key, { now, windowMs, maxRequests }) {
  for (const [bucketKey, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(bucketKey);
  }

  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    const reset = now + windowMs;
    buckets.set(key, { count: 1, resetAt: reset });
    return { allowed: true, limit: maxRequests, remaining: maxRequests - 1, reset };
  }

  if (bucket.count >= maxRequests) {
    return {
      allowed: false,
      limit: maxRequests,
      remaining: 0,
      reset: bucket.resetAt,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count++;
  return { allowed: true, limit: maxRequests, remaining: maxRequests - bucket.count, reset: bucket.resetAt };
}

export function recordLocalFailure(attempts, key, { now, windowMs, maxAttempts }) {
  for (const [attemptKey, record] of attempts) {
    if (now >= record.expiresAt) attempts.delete(attemptKey);
  }

  let record = attempts.get(key);
  if (!record || now >= record.expiresAt) {
    record = { count: 0, expiresAt: now + windowMs, lockedUntil: 0 };
    attempts.set(key, record);
  }
  if (record.lockedUntil > now) return;

  record.count++;
  if (record.count >= maxAttempts) {
    record.lockedUntil = now + windowMs;
    record.expiresAt = record.lockedUntil;
  }
}

export function getLocalLockout(attempts, key, now) {
  for (const [attemptKey, record] of attempts) {
    if (now >= record.expiresAt) attempts.delete(attemptKey);
  }

  const record = attempts.get(key);
  if (!record || record.lockedUntil <= now) return { locked: false };
  return { locked: true, retryAfter: Math.ceil((record.lockedUntil - now) / 1000) };
}

export function clearLocalLockout(attempts, key) {
  attempts.delete(key);
}