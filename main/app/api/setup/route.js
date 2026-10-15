import { timingSafeEqual } from "node:crypto";
import { isSameOriginMutation, requireHeadTrainer } from "../../../lib/auth";
import { initializeSpreadsheet } from "../../../lib/google-sheets";
import { sampleData } from "../../../lib/sample-data";

export const runtime = "nodejs";

function validSetupToken(provided, expected) {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request) {
  if (!isSameOriginMutation(request)) {
    return Response.json({ error: "Cross-origin setup requests are not allowed." }, { status: 403 });
  }

  const configuredSetupToken = process.env.SETUP_TOKEN;
  const providedSetupToken = request.headers.get("x-setup-token");
  const setupTokenOk = validSetupToken(providedSetupToken, configuredSetupToken);
  if (configuredSetupToken && !setupTokenOk) {
    return Response.json({ error: "A valid setup token is required." }, { status: 403 });
  }
  try {
    if (!setupTokenOk) {
      const { response } = await requireHeadTrainer();
      if (response) return response;
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "A valid JSON setup request is required." }, { status: 400 });
    }
    const seed = body.seed === true;
    const result = await initializeSpreadsheet({
      seedData: seed ? {
        Diplomas: sampleData.diplomas,
        "Master Schedule": sampleData.schedule,
        Faculty: sampleData.faculty,
        Courses: sampleData.courses,
      } : {},
    });
    return Response.json({ ok: true, seedRequested: seed, result });
  } catch (error) {
    console.error("Spreadsheet initialization failed:", error.message);
    return Response.json({ error: "The spreadsheet could not be initialized. Check server logs and sheet access." }, { status: 503 });
  }
}
