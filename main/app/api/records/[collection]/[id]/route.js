import { isSameOriginMutation } from "../../../../../lib/auth";
import { authorizedMutation, isCollection, removeRecord, replaceRecord } from "../../../../../lib/api-data";
import { rateLimit, rateLimitHeaders, rateLimitResponse } from "../../../../../lib/rate-limit.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard(request, params) {
  const rl = await rateLimit(request);
  const rlHeaders = rateLimitHeaders(rl);
  if (!rl.allowed) return { response: rateLimitResponse(rl) };

  if (!isSameOriginMutation(request)) {
    return { response: Response.json({ error: "Cross-origin changes are not allowed." }, { status: 403, headers: rlHeaders }) };
  }
  const { collection } = await params;
  if (!isCollection(collection)) {
    return { collection, response: Response.json({ error: "Unknown collection." }, { status: 404, headers: rlHeaders }) };
  }
  try {
    const { response } = await authorizedMutation();
    return { collection, response, rlHeaders };
  } catch (error) {
    console.error("Record mutation authorization failed:", error.message);
    return {
      collection,
      response: Response.json({ error: "Access could not be verified." }, { status: 503, headers: rlHeaders }),
      rlHeaders,
    };
  }
}

export async function PUT(request, { params }) {
  const guarded = await guard(request, params);
  if (guarded.response) return guarded.response;
  const { id } = await params;
  const { rlHeaders } = guarded;
  try {
    const body = await request.json().catch(() => null);
    if (!body) return Response.json({ error: "A valid JSON record is required." }, { status: 400, headers: rlHeaders });
    const result = await replaceRecord(guarded.collection, id, body);
    if (result.error) return Response.json({ error: result.error }, { status: result.status, headers: rlHeaders });
    return Response.json({ record: result.record }, { headers: rlHeaders });
  } catch (error) {
    console.error(`Updating ${guarded.collection} record failed:`, error.code || error.status || "server error");
    return Response.json({ error: "The record could not be updated." }, { status: 503, headers: rlHeaders });
  }
}

export async function DELETE(request, { params }) {
  const guarded = await guard(request, params);
  if (guarded.response) return guarded.response;
  const { id } = await params;
  const { rlHeaders } = guarded;
  try {
    const result = await removeRecord(guarded.collection, id);
    if (result.error) return Response.json({ error: result.error }, { status: result.status, headers: rlHeaders });
    return Response.json({ ok: true }, { headers: rlHeaders });
  } catch (error) {
    console.error(`Deleting ${guarded.collection} record failed:`, error.code || error.status || "server error");
    return Response.json({ error: "The record could not be deleted." }, { status: 503, headers: rlHeaders });
  }
}
