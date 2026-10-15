import { isSameOriginMutation } from "../../../../lib/auth";
import { authorizedMutation, createRecord, getPublicRecords, isCollection } from "../../../../lib/api-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const { collection } = await params;
  if (!isCollection(collection)) return Response.json({ error: "Unknown collection." }, { status: 404 });
  try {
    return Response.json({ records: await getPublicRecords(collection) }, {
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
  } catch (error) {
    console.error(`Reading ${collection} failed:`, error.code || error.status || "server error");
    return Response.json({ error: "Records could not be loaded." }, { status: 503 });
  }
}

export async function POST(request, { params }) {
  if (!isSameOriginMutation(request)) {
    return Response.json({ error: "Cross-origin changes are not allowed." }, { status: 403 });
  }
  const { collection } = await params;
  if (!isCollection(collection)) return Response.json({ error: "Unknown collection." }, { status: 404 });
  try {
    const { response } = await authorizedMutation();
    if (response) return response;
    const body = await request.json().catch(() => null);
    if (!body) return Response.json({ error: "A valid JSON record is required." }, { status: 400 });
    const result = await createRecord(collection, body);
    if (result.error) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ record: result.record }, { status: 201 });
  } catch (error) {
    console.error(`Creating ${collection} record failed:`, error.code || error.status || "server error");
    return Response.json({ error: "The record could not be saved." }, { status: 503 });
  }
}
