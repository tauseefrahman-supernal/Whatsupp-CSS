import type { NextRequest } from "next/server";
import { z } from "zod";
import { createAthlete, updateAthleteProfile, listAthletes } from "@/lib/db";

export async function GET() {
  return Response.json({ athletes: listAthletes() });
}

const CreateBody = z.object({
  name: z.string().trim().min(1).max(80),
  // Optional initial profile facts (e.g. show_in_switcher for picker-created profiles).
  profile: z.record(z.string(), z.unknown()).optional(),
});

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
  let athlete = createAthlete(body.name);
  if (body.profile && Object.keys(body.profile).length > 0) {
    athlete = updateAthleteProfile(athlete.id, { profile: body.profile }) ?? athlete;
  }
  return Response.json({ athlete }, { status: 201 });
}
