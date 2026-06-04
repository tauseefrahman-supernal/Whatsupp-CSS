import type { NextRequest } from "next/server";
import { getProtocol, listProtocolSessionLogs } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const protocol = getProtocol(id);
  if (!protocol) return Response.json({ error: "Not found" }, { status: 404 });

  const logs = listProtocolSessionLogs(id).map(l => ({
    ...l,
    data: l.data_json ? safeJson(l.data_json) : null,
  }));
  const data = safeJson(protocol.data_json);

  return Response.json({
    protocol: {
      id: protocol.id,
      athlete_id: protocol.athlete_id,
      supplement: protocol.supplement,
      event: protocol.event,
      created_at: protocol.created_at,
      data,
    },
    logs,
  });
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
