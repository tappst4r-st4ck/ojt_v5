import { requireHeadTrainer } from "../../../../lib/auth";
import { getPublicRecords } from "../../../../lib/api-data";
import { uploadCurriculumSheetToDiplomaFolder, listDiplomaFolders, getDiplomaFolderFiles } from "../../../../lib/google-drive";
import { rateLimit, rateLimitHeaders, rateLimitResponse } from "../../../../lib/rate-limit.mjs";

export const runtime = "nodejs";

export async function GET(request) {
  const rl = await rateLimit(request);
  const rlHeaders = rateLimitHeaders(rl);
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const { response } = await requireHeadTrainer();
    if (response) return response;

    const folders = await listDiplomaFolders();
    return Response.json({ ok: true, folders }, { headers: rlHeaders });
  } catch (error) {
    console.error("List diploma folders failed:", error.message);
    return Response.json({ error: "Failed to list diploma folders." }, { status: 503, headers: rlHeaders });
  }
}

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

    const { diplomaCode, spreadsheetId, spreadsheetTitle } = body;
    if (!diplomaCode || !spreadsheetId) {
      return Response.json({ error: "diplomaCode and spreadsheetId are required." }, { status: 400, headers: rlHeaders });
    }

    const diplomas = await getPublicRecords("Diplomas");
    const diploma = diplomas.find(d => d.code === diplomaCode);
    if (!diploma) {
      return Response.json({ error: "Diploma not found." }, { status: 404, headers: rlHeaders });
    }

    const title = spreadsheetTitle || diploma.name;
    const result = await uploadCurriculumSheetToDiplomaFolder(diplomaCode, spreadsheetId, title);

    return Response.json({ ok: true, result }, { headers: rlHeaders });
  } catch (error) {
    console.error("Upload curriculum sheet failed:", error.message);
    return Response.json({ error: "Failed to upload curriculum sheet." }, { status: 503, headers: rlHeaders });
  }
}