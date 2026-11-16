import { requireHeadTrainer } from "../../../../lib/auth";
import { importFromSheet } from "../../../../lib/google-sheets";
import { rateLimit, rateLimitHeaders, rateLimitResponse } from "../../../../lib/rate-limit.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  const rl = await rateLimit(request);
  const rlHeaders = rateLimitHeaders(rl);
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const { response } = await requireHeadTrainer();
    if (response) return response;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid request body." }, { status: 400, headers: rlHeaders });
    }

    const sourceSpreadsheetId = body.spreadsheetId?.trim();
    if (!sourceSpreadsheetId) {
      return Response.json({ error: "spreadsheetId is required." }, { status: 400, headers: rlHeaders });
    }

    const result = await importFromSheet(sourceSpreadsheetId);
    return Response.json({ ok: true, result }, { headers: rlHeaders });
  } catch (error) {
    console.error("Sheet import failed:", error.message);
    return Response.json({ error: "Import failed. Check server logs." }, { status: 503, headers: rlHeaders });
  }
}