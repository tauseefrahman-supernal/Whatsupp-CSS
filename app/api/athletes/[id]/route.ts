import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAthlete, updateAthleteProfile, deleteAthlete, listSessions, listMessages } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const athlete = getAthlete(id);
  if (!athlete) return Response.json({ error: "Not found" }, { status: 404 });

  const sessions = listSessions(id);
  const recent = sessions[0] ? listMessages(sessions[0].id) : [];
  return Response.json({ athlete, sessions, recentMessages: recent });
}

const PatchBody = z.object({
  name: z.string().optional(),
  sex: z.string().nullable().optional(),
  age: z.number().int().nullable().optional(),
  weight_kg: z.number().nullable().optional(),
  sport: z.string().nullable().optional(),
  level: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
  profile: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await request.json());
  } catch (err) {
    return Response.json(
      { error: "Invalid body", detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
  const updated = updateAthleteProfile(id, body);
  if (!updated) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ athlete: updated });
}

/**
 * DELETE /api/athletes/:id — remove a user-created profile and all of its
 * conversations and protocols. The seeded demo cast (Mia, Matt, Percy) is
 * protected and returns 403.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const athlete = getAthlete(id);
  if (!athlete) return Response.json({ error: "Not found" }, { status: 404 });

  const ok = deleteAthlete(id);
  if (!ok) {
    return Response.json({ error: "The demo cast profiles cannot be deleted." }, { status: 403 });
  }
  return Response.json({ deleted: id });
}
