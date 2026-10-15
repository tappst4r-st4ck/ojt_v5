import { getAuthenticatedUser } from "../../../lib/auth";
import { getPublicRecords } from "../../../lib/api-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [diplomas, schedule, faculty, courses, user] = await Promise.all([
      getPublicRecords("Diplomas"),
      getPublicRecords("Master Schedule"),
      getPublicRecords("Faculty"),
      getPublicRecords("Courses"),
      getAuthenticatedUser(),
    ]);
    return Response.json({ diplomas, schedule, faculty, courses, user }, {
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
  } catch (error) {
    console.error("Dashboard data read failed:", error.code || error.status || "server error");
    return Response.json({ error: "Dashboard data could not be loaded." }, { status: 503 });
  }
}
