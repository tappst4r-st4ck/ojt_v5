export async function GET() {
  const rolePreviewEnabled =
    process.env.NODE_ENV !== "production" && process.env.ENABLE_ROLE_PREVIEW !== "false";
  return Response.json(
    {
      googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
      rolePreviewEnabled,
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
