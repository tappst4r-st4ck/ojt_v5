import { getAuthenticatedUser } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    return Response.json({ user }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) {
    console.error("Session lookup failed:", error.code || error.status || "server error");
    return Response.json({ error: "Could not verify the current session." }, { status: 500 });
  }
}
