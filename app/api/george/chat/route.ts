import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  getAthlete,
  getOrCreateSession,
  getPriorSession,
  listMessages,
  appendMessage,
  createProtocol,
  type GeneratedProtocol,
} from "@/lib/db";
import { streamGeorge } from "@/lib/claude";

const Body = z.object({
  athleteId: z.string().min(1),
  message: z.string().min(1),
  channel: z.enum(["text", "voice"]).default("text"),
});

export async function POST(request: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    const json = await request.json();
    body = Body.parse(json);
  } catch (err) {
    return Response.json(
      { error: "Invalid request body", detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const athlete = getAthlete(body.athleteId);
  if (!athlete) {
    return Response.json({ error: `Unknown athlete: ${body.athleteId}` }, { status: 404 });
  }

  const session = getOrCreateSession(athlete.id);
  const history = listMessages(session.id);
  const prior = getPriorSession(athlete.id, session.id);
  const lastSummary = prior?.summary ?? null;

  // Persist the user's message immediately so it shows in history if the stream fails.
  appendMessage(session.id, "user", body.message);

  const encoder = new TextEncoder();
  let assistantText = "";
  let assistantMeta: Record<string, unknown> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const it = streamGeorge({
          athlete,
          history,
          userMessage: body.message,
          channel: body.channel,
          lastSummary,
        });

        for await (const event of it) {
          if (event.type === "text" && event.text) {
            assistantText += event.text;
            controller.enqueue(encoder.encode(sse("text", { text: event.text })));
          } else if (event.type === "meta" && event.meta) {
            // If George emitted a protocol_card, persist it to the protocols table
            // and rewrite the CTA url with the real protocol id so the chat card
            // links to a real Protocols workspace.
            const protocolCard = (event.meta as { protocol_card?: Record<string, unknown> }).protocol_card;
            if (protocolCard && typeof protocolCard === "object") {
              try {
                const data: GeneratedProtocol = {
                  title: String(protocolCard.title ?? "Self-test protocol"),
                  rationale: String(protocolCard.rationale ?? ""),
                  sessions: (protocolCard.sessions as GeneratedProtocol["sessions"]) ?? [],
                  log_variables: (protocolCard.log_variables as string[]) ?? [],
                  bottom_line: String(protocolCard.bottom_line ?? ""),
                };
                const row = createProtocol(athlete.id, "caffeine", String(protocolCard.event ?? data.title), data);
                (event.meta as Record<string, unknown>).protocol_card = {
                  ...protocolCard,
                  cta_url: `/protocols/${row.id}?a=${athlete.id}`,
                  cta_label: protocolCard.cta_label ?? "Open in Protocols workspace",
                  protocol_id: row.id,
                };
              } catch (e) {
                // Don't break the chat if persistence fails — keep the card inline.
                console.error("Failed to persist protocol_card:", e);
              }
            }
            assistantMeta = event.meta;
            controller.enqueue(encoder.encode(sse("meta", event.meta)));
          } else if (event.type === "error" && event.message) {
            controller.enqueue(encoder.encode(sse("error", { message: event.message })));
          } else if (event.type === "done") {
            controller.enqueue(encoder.encode(sse("done", {})));
          }
        }

        // Persist assistant message (with meta if present).
        if (assistantText.trim().length > 0) {
          appendMessage(session.id, "assistant", assistantText.trim(), assistantMeta);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(sse("error", { message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Connection": "keep-alive",
    },
  });
}

function sse(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
