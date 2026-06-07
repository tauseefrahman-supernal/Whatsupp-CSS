import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSession, getAthlete, listMessages, renameSession } from "@/lib/db";

/**
 * GET /api/sessions/:id — a specific conversation with its full message list,
 * so History can deep-link back into the chat exactly as it happened.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return Response.json({ error: "Unknown session" }, { status: 404 });

  const athlete = getAthlete(session.athlete_id);
  const messages = listMessages(session.id);
  return Response.json({ session, athlete, messages });
}

const PatchBody = z.object({
  topic: z.string().trim().min(1).max(120),
});

/** PATCH /api/sessions/:id — rename the conversation. */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return Response.json({ error: "Unknown session" }, { status: 404 });

  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await request.json());
  } catch (err) {
    return Response.json(
      { error: "Invalid body", detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  renameSession(id, body.topic);
  return Response.json({ session: getSession(id) });
}
