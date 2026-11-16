import { getAuthenticatedUser } from "../../../../lib/auth";
import { rateLimit, rateLimitHeaders, rateLimitResponse } from "../../../../lib/rate-limit.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const rl = await rateLimit(request);
  const rlHeaders = rateLimitHeaders(rl);
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const user = await getAuthenticatedUser();
    return Response.json({ user }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie", ...rlHeaders } });
  } catch (error) {
    console.error("Session lookup failed:", error.code || error.status || "server error");
    return Response.json({ error: "Could not verify the current session." }, { status: 500, headers: rlHeaders });
  }
}
