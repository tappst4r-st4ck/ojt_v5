import { createSessionFromGoogleCredential, setSessionCookie, isSameOriginMutation } from "../../../../lib/auth";
import { rateLimit, rateLimitHeaders, rateLimitResponse } from "../../../../lib/rate-limit.mjs";
import { recordFailedAttempt, recordSuccess, checkLockout } from "../../../../lib/account-lockout.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  // Rate limiting
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
    return Response.json({ error: "Cross-origin sign-in requests are not allowed." }, { status: 403, headers: rlHeaders });
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body?.credential || typeof body.credential !== "string") {
      return Response.json({ error: "Google credential is required." }, { status: 400, headers: rlHeaders });
    }

    const session = await createSessionFromGoogleCredential(body.credential);
    await recordSuccess(request);
    const response = Response.json(
      { user: session.user },
      { headers: { "Cache-Control": "private, no-store", Vary: "Cookie", ...rlHeaders } }
    );
    setSessionCookie(response, session.token);
    return response;
  } catch (error) {
    console.error("Google sign-in failed:", error.code || "server error");
    if (["INVALID_GOOGLE_CREDENTIAL", "FACULTY_ACCOUNT_REQUIRED"].includes(error.code)) {
      try {
        await recordFailedAttempt(request);
      } catch {
        return Response.json({ error: "Authentication controls are unavailable." }, {
          status: 503,
          headers: rlHeaders,
        });
      }
    }

    if (error.code === "INVALID_GOOGLE_CREDENTIAL") {
      return Response.json({ error: "Google credential is invalid or expired." }, { status: 401, headers: rlHeaders });
    }
    if (error.code === "FACULTY_ACCOUNT_REQUIRED") {
      return Response.json({ error: "This Google account is not listed in the Faculty Database." }, { status: 403, headers: rlHeaders });
    }
    return Response.json({ error: "Sign-in could not be completed. Check server configuration and spreadsheet access." }, { status: 503, headers: rlHeaders });
  }
}
