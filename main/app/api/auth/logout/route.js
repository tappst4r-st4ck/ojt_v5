import { clearSessionCookie, isSameOriginMutation } from "../../../../lib/auth";

export async function POST(request) {
  if (!isSameOriginMutation(request)) {
    return Response.json({ error: "Cross-origin sign-out requests are not allowed." }, { status: 403 });
  }
  const response = Response.json(
    { ok: true },
    { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } }
  );
  clearSessionCookie(response);
  return response;
}
