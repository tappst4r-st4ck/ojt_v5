import { requireHeadTrainer } from "../../../../lib/auth";
import { getDiplomaFolderFiles } from "../../../../lib/google-drive";
import { isDriveId } from "../../../../lib/record-validation.mjs";
import { rateLimit, rateLimitHeaders, rateLimitResponse } from "../../../../lib/rate-limit.mjs";

export const runtime = "nodejs";

export async function GET(request) {
  const rl = await rateLimit(request);
  const rlHeaders = rateLimitHeaders(rl);
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const { response } = await requireHeadTrainer();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get("folderId");
    if (!isDriveId(folderId)) {
      return Response.json({ error: "A valid folderId is required." }, { status: 400, headers: rlHeaders });
    }

    const files = await getDiplomaFolderFiles(folderId);
    return Response.json({ ok: true, files }, { headers: rlHeaders });
  } catch (error) {
    console.error("Get diploma folder files failed:", error.message);
    return Response.json({ error: "Failed to get folder files." }, { status: 503, headers: rlHeaders });
  }
}