import { isSameOriginMutation } from "../../../../lib/auth";
import { authorizedMutation, createRecord, getPublicRecords, isCollection } from "../../../../lib/api-data";
import { rateLimit, rateLimitHeaders, rateLimitResponse } from "../../../../lib/rate-limit.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const rl = await rateLimit(request);
  const rlHeaders = rateLimitHeaders(rl);
  if (!rl.allowed) return rateLimitResponse(rl);

  const { collection } = await params;
  if (!isCollection(collection)) return Response.json({ error: "Unknown collection." }, { status: 404, headers: rlHeaders });
  try {
    const records = await getPublicRecords(collection);
    return Response.json({ records }, {
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie", ...rlHeaders },
    });
  } catch (error) {
    console.error(`Reading ${collection} failed:`, error.code || error.status || "server error");
    return Response.json({ error: "Records could not be loaded." }, { status: 503, headers: rlHeaders });
  }
}

export async function POST(request, { params }) {
  const rl = await rateLimit(request);
  const rlHeaders = rateLimitHeaders(rl);
  if (!rl.allowed) return rateLimitResponse(rl);

  if (!isSameOriginMutation(request)) {
    return Response.json({ error: "Cross-origin changes are not allowed." }, { status: 403, headers: rlHeaders });
  }
  const { collection } = await params;
  if (!isCollection(collection)) return Response.json({ error: "Unknown collection." }, { status: 404, headers: rlHeaders });
  try {
    const { response } = await authorizedMutation();
    if (response) return response;
    const body = await request.json().catch(() => null);
    if (!body) return Response.json({ error: "A valid JSON record is required." }, { status: 400, headers: rlHeaders });
    const result = await createRecord(collection, body);
    if (result.error) return Response.json({ error: result.error }, { status: result.status, headers: rlHeaders });
    return Response.json({ record: result.record }, { status: 201, headers: rlHeaders });
  } catch (error) {
    console.error(`Creating ${collection} record failed:`, error.code || error.status || "server error");
    return Response.json({ error: "The record could not be saved." }, { status: 503, headers: rlHeaders });
  }
}
