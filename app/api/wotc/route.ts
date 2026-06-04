import type { NextRequest } from "next/server";
import { z } from "zod";
import { consultExpert, consultLiveExpert, consultCrowd, listExperts } from "@/lib/wotc";

const Body = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("trent"),
    expertId: z.string().min(1),
    question: z.string().trim().min(8).max(8000),
  }),
  z.object({
    mode: z.literal("live"),
    expertId: z.string().min(1),
    question: z.string().trim().min(8).max(8000),
    delayMs: z.number().int().min(0).max(60000).optional(),
  }),
  z.object({
    mode: z.literal("crowd"),
    question: z.string().trim().min(8).max(8000),
  }),
]);

export async function GET() {
  // List available experts so the UI can offer a picker.
  return Response.json({ experts: listExperts() });
}

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

  try {
    if (body.mode === "trent") {
      const response = await consultExpert(body.expertId, body.question);
      return Response.json({ mode: "trent", expertId: body.expertId, response });
    }
    if (body.mode === "live") {
      const response = await consultLiveExpert(body.expertId, body.question, body.delayMs ?? 8000);
      return Response.json({ mode: "live", expertId: body.expertId, response });
    }
    // crowd
    const result = await consultCrowd(body.question);
    return Response.json({ mode: "crowd", ...result });
  } catch (err) {
    console.error("wotc failed:", err);
    return Response.json(
      { error: "Wise Crowd consultation failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
