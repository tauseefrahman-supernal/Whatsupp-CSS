import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAthlete, getOrCreateSession, appendMessage } from "@/lib/db";

const Body = z.object({
  athleteId: z.string().min(1),
  userTranscript: z.string().optional(),
  assistantTranscript: z.string().optional(),
});

/**
 * POST /api/george/voice/persist
 *
 * Called by the voice frontend on every completed turn to persist transcripts
 * to the chat history so voice exchanges appear in the conversation thread
 * after the call ends.
 */
export async function POST(request: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return Response.json(
      { error: "Invalid body", detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const athlete = getAthlete(body.athleteId);
  if (!athlete) return Response.json({ error: "Unknown athlete" }, { status: 404 });

  const session = getOrCreateSession(athlete.id);

  if (body.userTranscript?.trim()) {
    appendMessage(session.id, "user", body.userTranscript.trim(), { source: "voice" });
  }
  if (body.assistantTranscript?.trim()) {
    appendMessage(session.id, "assistant", body.assistantTranscript.trim(), { source: "voice" });
  }

  return Response.json({ ok: true });
}
