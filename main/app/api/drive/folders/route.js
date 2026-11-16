import { requireHeadTrainer } from "../../../../lib/auth";
import { getPublicRecords } from "../../../../lib/api-data";
import { ensureDiplomaFolderStructure } from "../../../../lib/google-drive";
import { rateLimit, rateLimitHeaders, rateLimitResponse } from "../../../../lib/rate-limit.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  const rl = await rateLimit(request);
  const rlHeaders = rateLimitHeaders(rl);
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const { response } = await requireHeadTrainer();
    if (response) return response;

    const diplomas = await getPublicRecords("Diplomas");
    const result = await ensureDiplomaFolderStructure(diplomas);

    return Response.json({ ok: true, result }, { headers: rlHeaders });
  } catch (error) {
    console.error("Drive folder setup failed:", error.message);
    return Response.json({ error: "Failed to create folder structure." }, { status: 503, headers: rlHeaders });
  }
}