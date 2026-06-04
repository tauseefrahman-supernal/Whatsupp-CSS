import type { NextRequest } from "next/server";
import { z } from "zod";
import { getProtocol, logProtocolSession } from "@/lib/db";

const Body = z.object({
  sessionIdx: z.number().int().min(1).max(20),
  data: z.record(z.string(), z.unknown()).optional(),
  log: z.string().trim().max(8000).optional(),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return Response.json(
      { error: "Invalid body", detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const protocol = getProtocol(id);
  if (!protocol) return Response.json({ error: "Not found" }, { status: 404 });

  const entry = logProtocolSession(id, body.sessionIdx, body.data ?? null, body.log ?? null);
  return Response.json({
    entry: {
      ...entry,
      data: entry.data_json ? safeJson(entry.data_json) : null,
    },
  }, { status: 201 });
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
