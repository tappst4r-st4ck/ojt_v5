import { createSessionFromGoogleCredential, setSessionCookie, isSameOriginMutation } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!isSameOriginMutation(request)) {
    return Response.json({ error: "Cross-origin sign-in requests are not allowed." }, { status: 403 });
  }
  try {
    const body = await request.json().catch(() => null);
    if (!body?.credential || typeof body.credential !== "string") {
      return Response.json({ error: "Google credential is required." }, { status: 400 });
    }
    const session = await createSessionFromGoogleCredential(body.credential);
    const response = Response.json(
      { user: session.user },
      { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } }
    );
    setSessionCookie(response, session.token);
    return response;
  } catch (error) {
    console.error("Google sign-in failed:", error.code || "server error");
    if (error.code === "INVALID_GOOGLE_CREDENTIAL") {
      return Response.json({ error: "Google credential is invalid or expired." }, { status: 401 });
    }
    if (error.code === "FACULTY_ACCOUNT_REQUIRED") {
      return Response.json({ error: "This Google account is not listed in the Faculty Database." }, { status: 403 });
    }
    return Response.json({ error: "Sign-in could not be completed. Check server configuration and spreadsheet access." }, { status: 503 });
  }
}
