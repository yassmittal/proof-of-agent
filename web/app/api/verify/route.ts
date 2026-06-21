import { createReadClient } from "@sdk/walrus-client";
import { verifyAnchor } from "@sdk/verify";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let anchorObjectId: string;
  let tamper = false;
  try {
    ({ anchorObjectId, tamper = false } = await request.json());
  } catch {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }

  if (!anchorObjectId?.trim()) {
    return Response.json({ error: "anchorObjectId is required" }, { status: 400 });
  }

  try {
    const report = await verifyAnchor(createReadClient(), anchorObjectId.trim(), { tamper });
    return Response.json(report);
  } catch (e) {
    const msg = String(e);
    if (/fetch failed|INTERNAL|UNAVAILABLE|ECONNREFUSED|timeout/i.test(msg)) {
      return Response.json(
        { error: "Sui RPC node is temporarily unavailable — please retry in a moment." },
        { status: 503 },
      );
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
