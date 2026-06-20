import { createReadClient } from "@sdk/walrus-client";
import { verifyAnchor } from "@sdk/verify";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let anchorObjectId: string;
  try {
    ({ anchorObjectId } = await request.json());
  } catch {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }

  if (!anchorObjectId?.trim()) {
    return Response.json({ error: "anchorObjectId is required" }, { status: 400 });
  }

  try {
    const report = await verifyAnchor(createReadClient(), anchorObjectId.trim());
    return Response.json(report);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
