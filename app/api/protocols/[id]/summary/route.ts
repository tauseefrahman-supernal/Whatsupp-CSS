import type { NextRequest } from "next/server";
import { getAthlete, getProtocol, listProtocolSessionLogs } from "@/lib/db";
import { summariseSessionLogs } from "@/lib/protocol";
import type { GeneratedProtocol } from "@/lib/db";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const protocol = getProtocol(id);
  if (!protocol) return Response.json({ error: "Not found" }, { status: 404 });

  const athlete = getAthlete(protocol.athlete_id);
  if (!athlete) return Response.json({ error: "Orphaned protocol" }, { status: 500 });

  const logs = listProtocolSessionLogs(id);
  if (logs.length === 0) {
    return Response.json({ error: "No sessions logged yet" }, { status: 400 });
  }

  let generated: GeneratedProtocol;
  try {
    generated = JSON.parse(protocol.data_json) as GeneratedProtocol;
  } catch {
    return Response.json({ error: "Protocol data is corrupt" }, { status: 500 });
  }

  try {
    const summary = await summariseSessionLogs(athlete, generated, logs);
    return Response.json({ summary });
  } catch (err) {
    return Response.json(
      { error: "Could not summarise", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
