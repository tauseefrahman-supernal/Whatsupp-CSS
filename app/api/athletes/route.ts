import type { NextRequest } from "next/server";
import { z } from "zod";
import { createAthlete, listAthletes } from "@/lib/db";

export async function GET() {
  return Response.json({ athletes: listAthletes() });
}

const CreateBody = z.object({ name: z.string().trim().min(1).max(80) });

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
  const athlete = createAthlete(body.name);
  return Response.json({ athlete }, { status: 201 });
}
