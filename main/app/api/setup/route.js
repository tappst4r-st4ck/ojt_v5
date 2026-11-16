import { timingSafeEqual } from "node:crypto";
import { isSameOriginMutation, requireHeadTrainer } from "../../../lib/auth";
import { initializeSpreadsheet } from "../../../lib/google-sheets";
import { sampleData } from "../../../lib/sample-data";
import { rateLimit, rateLimitHeaders, rateLimitResponse } from "../../../lib/rate-limit.mjs";
import { recordFailedAttempt, recordSuccess, checkLockout } from "../../../lib/account-lockout.mjs";

export const runtime = "nodejs";

function validSetupToken(provided, expected) {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request) {
  const rl = await rateLimit(request);
  const rlHeaders = rateLimitHeaders(rl);
  if (!rl.allowed) return rateLimitResponse(rl);

  const lockout = await checkLockout(request);
  if (lockout.unavailable) {
    return Response.json({ error: "Authentication controls are unavailable." }, {
      status: 503,
      headers: { "Retry-After": String(lockout.retryAfter) },
    });
  }
  if (lockout.locked) {
    return Response.json({ error: "Too many failed attempts. Please try again later." }, {
      status: 429,
      headers: { "Retry-After": String(lockout.retryAfter) },
    });
  }

  if (!isSameOriginMutation(request)) {
    return Response.json({ error: "Cross-origin setup requests are not allowed." }, { status: 403, headers: rlHeaders });
  }

  const configuredSetupToken = process.env.SETUP_TOKEN;
  const providedSetupToken = request.headers.get("x-setup-token");
  const setupTokenOk = validSetupToken(providedSetupToken, configuredSetupToken);
  if (configuredSetupToken && !setupTokenOk) {
    try {
      await recordFailedAttempt(request);
    } catch {
      return Response.json({ error: "Authentication controls are unavailable." }, { status: 503, headers: rlHeaders });
    }
    return Response.json({ error: "A valid setup token is required." }, { status: 403, headers: rlHeaders });
  }

  try {
    if (!setupTokenOk) {
      const { response } = await requireHeadTrainer();
      if (response) {
        if (response.status === 401 || response.status === 403) {
          try {
            await recordFailedAttempt(request);
          } catch {
            return Response.json({ error: "Authentication controls are unavailable." }, { status: 503, headers: rlHeaders });
          }
        }
        return response;
      }
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "A valid JSON setup request is required." }, { status: 400, headers: rlHeaders });
    }
    const seed = body.seed === true;
    const result = await initializeSpreadsheet({
      seedData: seed ? {
        Diplomas: sampleData.diplomas,
        "Master Schedule": sampleData.schedule,
        Faculty: sampleData.faculty,
        Courses: sampleData.courses,
      } : {},
    });
    await recordSuccess(request);
    return Response.json({ ok: true, seedRequested: seed, result }, { headers: rlHeaders });
  } catch (error) {
    console.error("Spreadsheet initialization failed:", error.message);
    return Response.json({ error: "The spreadsheet could not be initialized. Check server logs and sheet access." }, { status: 503, headers: rlHeaders });
  }
}
