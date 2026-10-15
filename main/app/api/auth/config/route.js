export async function GET() {
  return Response.json(
    {
      googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
      rolePreviewEnabled: process.env.ENABLE_ROLE_PREVIEW === "true",
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
