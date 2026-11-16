import { clearSessionCookie, isSameOriginMutation } from "../../../../lib/auth";
import { rateLimit, rateLimitHeaders, rateLimitResponse } from "../../../../lib/rate-limit.mjs";

export async function POST(request) {
  const rl = await rateLimit(request);
  const rlHeaders = rateLimitHeaders(rl);
  if (!rl.allowed) return rateLimitResponse(rl);

  if (!isSameOriginMutation(request)) {
    return Response.json({ error: "Cross-origin sign-out requests are not allowed." }, { status: 403, headers: rlHeaders });
  }

  const response = Response.json(
    { ok: true },
    { headers: { "Cache-Control": "private, no-store", Vary: "Cookie", ...rlHeaders } }
  );
  clearSessionCookie(response);
  return response;
}
