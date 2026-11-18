import { isSameOriginMutation, requireHeadTrainer } from "../../../../lib/auth";
import { importFromSheet } from "../../../../lib/google-sheets";
import { isDriveId } from "../../../../lib/record-validation.mjs";
import { rateLimit, rateLimitHeaders, rateLimitResponse } from "../../../../lib/rate-limit.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  const rl = await rateLimit(request);
  const rlHeaders = rateLimitHeaders(rl);
  if (!rl.allowed) return rateLimitResponse(rl);

  if (!isSameOriginMutation(request)) {
    return Response.json({ error: "Cross-origin changes are not allowed." }, { status: 403, headers: rlHeaders });
  }

  try {
    const { response } = await requireHeadTrainer();
    if (response) return response;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid request body." }, { status: 400, headers: rlHeaders });
    }

    const sourceSpreadsheetId = typeof body.spreadsheetId === "string" ? body.spreadsheetId.trim() : "";
    if (!isDriveId(sourceSpreadsheetId)) {
      return Response.json({ error: "A valid Google Sheet ID is required." }, { status: 400, headers: rlHeaders });
    }

    const result = await importFromSheet(sourceSpreadsheetId);
    return Response.json({ ok: true, result }, { headers: rlHeaders });
  } catch (error) {
    console.error("Sheet import failed:", error.message);
    return Response.json({ error: "Import failed. Check server logs." }, { status: 503, headers: rlHeaders });
  }
}