import { isSameOriginMutation, requireHeadTrainer } from "../../../../lib/auth";
import { getPublicRecords } from "../../../../lib/api-data";
import { saveCurriculumSheet, listDiplomaFolders } from "../../../../lib/google-drive";
import { toCsv } from "../../../../lib/record-validation.mjs";
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

    // diplomaCode is a code from the Diplomas tab or "ALL"; year is a year level or "ALL".
    // pdf also exports each sheet to the Curriculum PDFs folder.
    const { diplomaCode, year = "ALL", pdf = false } = body;
    if (typeof diplomaCode !== "string" || !diplomaCode) {
      return Response.json({ error: "diplomaCode is required." }, { status: 400, headers: rlHeaders });
    }
    if (typeof year !== "string" || !/^(ALL|[1-6])$/.test(year) || typeof pdf !== "boolean") {
      return Response.json({ error: "year must be ALL or 1-6, and pdf must be true or false." }, { status: 400, headers: rlHeaders });
    }

    const [diplomas, courses] = await Promise.all([getPublicRecords("Diplomas"), getPublicRecords("Courses")]);
    const targets = diplomaCode === "ALL" ? diplomas : diplomas.filter(d => d.code === diplomaCode);
    if (targets.length === 0) {
      return Response.json({ error: "Diploma not found." }, { status: 404, headers: rlHeaders });
    }

    const uploaded = [];
    for (const diploma of targets) {
      const diplomaCourses = courses.filter(course => course.diplomaCode === diploma.code &&
        (year === "ALL" || String(course.diplomaYear) === year));
      const years = [...new Set(diplomaCourses.map(course => Number(course.diplomaYear)))].sort((a, b) => a - b);
      for (const courseYear of years) {
        const rows = diplomaCourses
          .filter(course => Number(course.diplomaYear) === courseYear)
          .sort((a, b) => a.semester - b.semester)
          .map(c => [c.diplomaYear, c.semester, c.code, c.name, c.lecUnits, c.labUnits, c.totalUnits, c.prerequisites, c.qualification]);
        const csv = toCsv([
          ["Year", "Semester", "Course Code", "Course Name", "Lec Units", "Lab Units", "Total Units", "Pre-Requisites", "Resultant Qualification"],
          ...rows,
        ]);
        uploaded.push(await saveCurriculumSheet(diploma, courseYear, csv, { pdf }));
      }
    }
    if (uploaded.length === 0) {
      return Response.json({ error: "The selected diploma and year have no courses to upload." }, { status: 404, headers: rlHeaders });
    }

    return Response.json({ ok: true, uploaded }, { headers: rlHeaders });
  } catch (error) {
    console.error("Upload curriculum sheet failed:", error.message);
    return Response.json({ error: "Failed to upload curriculum sheet." }, { status: 503, headers: rlHeaders });
  }
}