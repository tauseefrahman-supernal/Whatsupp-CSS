import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  getAthlete,
  listSessions,
  listMessages,
  createNewSession,
  updateSessionSummary,
} from "@/lib/db";
import { summariseSession } from "@/lib/claude";

const Body = z.object({
  athleteId: z.string().min(1),
});

/**
 * POST /api/sessions
 *
 * Start a new conversation for the athlete. Before creating the new session, summarise
 * the most recent prior session so George can recall the topic on greeting.
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

  // Find the most recent session. If it has messages and no summary, summarise it.
  const sessions = listSessions(athlete.id);
  const current = sessions[0];
  if (current && !current.summary) {
    const msgs = listMessages(current.id);
    if (msgs.length >= 2) {
      try {
        const summary = await summariseSession(athlete.name, msgs);
        if (summary) {
          updateSessionSummary(current.id, summary.topic, summary.summary);
        }
      } catch (err) {
        // Don't block new-session creation on summariser failure.
        console.error("summarise failed:", err);
      }
    }
  }

  const session = createNewSession(athlete.id);
  return Response.json({ session }, { status: 201 });
}
