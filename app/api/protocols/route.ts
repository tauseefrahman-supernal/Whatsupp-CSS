import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAthlete, createProtocol, listProtocols } from "@/lib/db";
import { generateProtocol } from "@/lib/protocol";

const CreateBody = z.object({
  athleteId: z.string().min(1),
  supplement: z.string().trim().min(1).max(120),
  event: z.string().trim().min(1).max(200),
  target: z.string().trim().max(200).optional(),
  sessions: z.number().int().min(2).max(12).optional(),
});

export async function GET(request: NextRequest) {
  const athleteId = request.nextUrl.searchParams.get("athleteId");
  if (!athleteId) return Response.json({ error: "athleteId required" }, { status: 400 });

  const rows = listProtocols(athleteId);
  const protocols = rows.map(r => ({
    id: r.id,
    athlete_id: r.athlete_id,
    supplement: r.supplement,
    event: r.event,
    created_at: r.created_at,
    data: safeJson(r.data_json),
  }));
  return Response.json({ protocols });
}

export async function POST(request: NextRequest) {
  let body: z.infer<typeof CreateBody>;
  try {
    body = CreateBody.parse(await request.json());
  } catch (err) {
    return Response.json(
      { error: "Invalid body", detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const athlete = getAthlete(body.athleteId);
  if (!athlete) return Response.json({ error: "Unknown athlete" }, { status: 404 });

  try {
    const generated = await generateProtocol({
      athlete,
      supplement: body.supplement,
      event: body.event,
      target: body.target,
      sessions: body.sessions,
    });
    const row = createProtocol(athlete.id, body.supplement, body.event, generated);
    return Response.json({
      protocol: {
        id: row.id,
        athlete_id: row.athlete_id,
        supplement: row.supplement,
        event: row.event,
        created_at: row.created_at,
        data: generated,
      },
    }, { status: 201 });
  } catch (err) {
    console.error("generateProtocol failed:", err);
    return Response.json(
      { error: "Could not generate protocol", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
