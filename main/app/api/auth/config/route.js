export async function GET() {
  return Response.json(
    { googleClientId: process.env.GOOGLE_CLIENT_ID ?? "" },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
